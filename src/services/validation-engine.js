const { query, transaction } = require('../../database/config/database');
const logger = require('../utils/logger');
const { trackError, measurePerformance } = require('../utils/telemetry');
const { recordValidationExecution } = require('../utils/metrics');
const PluginRegistry = require('./plugin-registry');
const { ValidationMetrics } = require('./validation-metrics');
const { ObservabilityManager } = require('./observability-manager');

/**
 * Core Validation Engine
 * Handles execution of different validation types with extensible architecture
 */
class ValidationEngine {
  constructor() {
    this.validators = new Map();
    this.pluginRegistry = new PluginRegistry();
    this.metricsManager = new ValidationMetrics();
    this.observabilityManager = new ObservabilityManager();
    this.isMonitoringEnabled = false;
    this.maxConcurrentExecutions = 10;
    this.setupDefaultValidators();
  }

  /**
   * Setup default validation handlers
   */
  setupDefaultValidators() {
    this.registerValidator('llm_model', new LLMModelValidator());
    this.registerValidator('code_function', new CodeFunctionValidator());
    this.registerValidator('api_endpoint', new APIEndpointValidator());
    this.registerValidator('data_pipeline', new DataPipelineValidator());
    this.registerValidator('ui_component', new UIComponentValidator());
  }

  /**
   * Register a new validator
   */
  registerValidator(type, validator) {
    this.validators.set(type, validator);
    logger.info('Validator registered', { type, validator: validator.constructor.name });
  }

  /**
   * Register a plugin validator
   */
  async registerPlugin(plugin) {
    await this.pluginRegistry.register(plugin);
    logger.info('Plugin registered', { name: plugin.name, version: plugin.version });
  }

  /**
   * Enable monitoring and observability
   */
  enableMonitoring(config) {
    this.observabilityManager.configure(config);
    this.isMonitoringEnabled = true;
    logger.info('Monitoring enabled', { config });
  }

  /**
   * Get available validators
   */
  getAvailableValidators() {
    const coreValidators = Array.from(this.validators.keys());
    const pluginValidators = this.pluginRegistry.getAvailableTypes();
    return [...coreValidators, ...pluginValidators];
  }

  /**
   * Get validation metrics
   */
  getMetrics() {
    return this.metricsManager.getMetrics();
  }

  /**
   * Execute validation for a specific test
   */
  async executeValidation(executionId, testId, testDefinition, expectedResult, targetType) {
    return await measurePerformance('validation_execution', async () => {
      const startTime = Date.now();
      let span;
      
      try {
        // Start observability span if monitoring enabled
        if (this.isMonitoringEnabled) {
          span = this.observabilityManager.startSpan('validation_execution', {
            executionId,
            testId,
            targetType
          });
        }

        // Update test status to running
        await query(
          'UPDATE validation_results SET status = $1, started_at = NOW() WHERE validation_execution_id = $2 AND test_id = $3',
          ['running', executionId, testId]
        );

        // Get the appropriate validator (check plugins first, then core validators)
        let validator = this.pluginRegistry.getValidator(targetType);
        if (!validator) {
          validator = this.validators.get(targetType);
        }
        
        if (!validator) {
          throw new Error(`No validator found for target type: ${targetType}`);
        }

        // Execute the validation
        const result = await this.executeValidatorWithRetry(validator, testDefinition, expectedResult, targetType);
        
        const endTime = Date.now();
        const executionTime = endTime - startTime;

        // Update test result
        await query(`
          UPDATE validation_results 
          SET status = $1, score = $2, max_score = $3, completed_at = NOW(), 
              execution_time_ms = $4, result_data = $5
          WHERE validation_execution_id = $6 AND test_id = $7
        `, [
          result.status,
          result.score,
          result.maxScore,
          executionTime,
          result.details,
          executionId,
          testId
        ]);

        // Record metrics
        recordValidationExecution(targetType, result.status, executionTime / 1000);
        this.metricsManager.recordExecution(targetType, result.status, executionTime / 1000, result.score);

        // Update observability span
        if (span) {
          span.setAttributes({
            'validation.status': result.status,
            'validation.score': result.score,
            'validation.execution_time': executionTime
          });
          span.end();
        }

        logger.logValidation(executionId, result.status, `Test ${testId} completed`, {
          testId,
          score: result.score,
          maxScore: result.maxScore,
          executionTime
        });

        return result;

      } catch (error) {
        const endTime = Date.now();
        const executionTime = endTime - startTime;

        // Update test result with error
        await query(`
          UPDATE validation_results 
          SET status = 'error', error_message = $1, completed_at = NOW(), execution_time_ms = $2
          WHERE validation_execution_id = $3 AND test_id = $4
        `, [error.message, executionTime, executionId, testId]);

        // Record error metrics
        recordValidationExecution(targetType, 'error', executionTime / 1000);
        this.metricsManager.recordExecution(targetType, 'error', executionTime / 1000, 0);

        // Update observability span with error
        if (span) {
          span.recordException(error);
          span.setStatus({ code: 2, message: error.message });
          span.end();
        }

        logger.logValidation(executionId, 'error', `Test ${testId} failed: ${error.message}`, {
          testId,
          error: error.message,
          executionTime
        });

        trackError(error, {
          operation: 'validation_execution',
          executionId,
          testId,
          targetType
        });

        throw error;
      }
    }, { executionId, testId, targetType });
  }

  /**
   * Execute validator with retry logic
   */
  async executeValidatorWithRetry(validator, testDefinition, expectedResult, targetType, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await validator.validate(testDefinition, expectedResult);
        
        if (attempt > 0) {
          logger.info('Validation succeeded after retry', { 
            targetType, 
            attempt, 
            maxRetries 
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          logger.warn('Validation failed, retrying', { 
            targetType, 
            attempt, 
            maxRetries, 
            delay, 
            error: error.message 
          });
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * Execute validations in parallel with concurrency control
   */
  async executeValidationsParallel(validations) {
    const results = [];
    const chunks = [];
    
    // Split validations into chunks based on maxConcurrentExecutions
    for (let i = 0; i < validations.length; i += this.maxConcurrentExecutions) {
      chunks.push(validations.slice(i, i + this.maxConcurrentExecutions));
    }
    
    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(validation => this.executeValidation(
          validation.executionId,
          validation.testId,
          validation.testDefinition,
          validation.expectedResult,
          validation.targetType
        ))
      );
      
      results.push(...chunkResults.map(result => 
        result.status === 'fulfilled' ? result.value : { error: result.reason }
      ));
    }
    
    return results;
  }

  /**
   * Execute all tests for a validation suite
   */
  async executeSuite(executionId, suiteId) {
    try {
      // Get all tests for the suite
      const testsResult = await query(`
        SELECT 
          t.*,
          vt.type as target_type
        FROM tests t
        JOIN validation_targets vt ON t.validation_target_id = vt.id
        WHERE t.validation_suite_id = $1 AND t.is_active = true
        ORDER BY t.priority DESC, t.created_at ASC
      `, [suiteId]);

      const tests = testsResult.rows;
      
      if (tests.length === 0) {
        throw new Error('No active tests found for suite');
      }

      logger.info('Starting suite execution', {
        executionId,
        suiteId,
        testCount: tests.length
      });

      // Execute tests sequentially (could be parallelized for better performance)
      const results = [];
      for (const test of tests) {
        try {
          const result = await this.executeValidation(
            executionId,
            test.id,
            test.test_definition,
            test.expected_result,
            test.target_type
          );
          results.push(result);
        } catch (error) {
          logger.error('Test execution failed', {
            executionId,
            testId: test.id,
            error: error.message
          });
          // Continue with other tests even if one fails
        }
      }

      // Update execution status
      const hasErrors = results.some(r => r.status === 'error');
      const hasFailed = results.some(r => r.status === 'failed');
      
      let finalStatus = 'completed';
      if (hasErrors) {
        finalStatus = 'failed';
      } else if (hasFailed) {
        finalStatus = 'completed'; // Completed with some failures
      }

      await query(
        'UPDATE validation_executions SET status = $1, completed_at = NOW() WHERE id = $2',
        [finalStatus, executionId]
      );

      logger.info('Suite execution completed', {
        executionId,
        suiteId,
        status: finalStatus,
        totalTests: tests.length,
        results: results.length
      });

      return {
        executionId,
        status: finalStatus,
        totalTests: tests.length,
        results
      };

    } catch (error) {
      // Mark execution as failed
      await query(
        'UPDATE validation_executions SET status = $1, completed_at = NOW() WHERE id = $2',
        ['failed', executionId]
      );

      trackError(error, {
        operation: 'suite_execution',
        executionId,
        suiteId
      });

      throw error;
    }
  }
}

/**
 * Base Validator class
 */
class BaseValidator {
  async validate(testDefinition, expectedResult) {
    throw new Error('validate method must be implemented by subclasses');
  }

  /**
   * Helper method to calculate similarity score
   */
  calculateSimilarity(actual, expected) {
    if (!actual || !expected) return 0;
    
    const actualStr = typeof actual === 'string' ? actual : JSON.stringify(actual);
    const expectedStr = typeof expected === 'string' ? expected : JSON.stringify(expected);
    
    // Simple Levenshtein distance-based similarity
    const distance = this.levenshteinDistance(actualStr, expectedStr);
    const maxLength = Math.max(actualStr.length, expectedStr.length);
    
    return maxLength === 0 ? 1 : 1 - (distance / maxLength);
  }

  /**
   * Levenshtein distance implementation
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
}

/**
 * LLM Model Validator
 */
class LLMModelValidator extends BaseValidator {
  async validate(testDefinition, expectedResult) {
    const { prompt, model_config, validation_criteria } = testDefinition;
    
    try {
      // Simulate LLM validation (in production, integrate with actual LLM APIs)
      const response = await this.simulateLLMResponse(prompt, model_config);
      
      // Evaluate response against criteria
      const evaluation = await this.evaluateResponse(response, expectedResult, validation_criteria);
      
      return {
        status: evaluation.passed ? 'passed' : 'failed',
        score: evaluation.score,
        maxScore: 100,
        details: {
          prompt,
          response,
          evaluation,
          model_config,
          validation_criteria
        }
      };
      
    } catch (error) {
      return {
        status: 'error',
        score: 0,
        maxScore: 100,
        details: {
          error: error.message,
          prompt,
          model_config
        }
      };
    }
  }

  async simulateLLMResponse(prompt, modelConfig) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
    
    // Generate a simulated response
    const responses = [
      "This is a simulated LLM response for validation testing.",
      "The model has processed your request and generated this output.",
      "Based on the input prompt, here is the generated response.",
      "This response demonstrates the model's capability to handle the given task."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  async evaluateResponse(response, expectedResult, criteria) {
    const evaluations = [];
    let totalScore = 0;
    let maxScore = 0;

    // Evaluate relevance
    if (criteria.relevance) {
      const relevanceScore = this.calculateSimilarity(response, expectedResult.content || '');
      evaluations.push({
        criterion: 'relevance',
        score: relevanceScore * 100,
        passed: relevanceScore >= (criteria.relevance.threshold || 0.7)
      });
      totalScore += relevanceScore * 100;
      maxScore += 100;
    }

    // Evaluate coherence
    if (criteria.coherence) {
      const coherenceScore = Math.random() * 0.3 + 0.7; // Simulate coherence check
      evaluations.push({
        criterion: 'coherence',
        score: coherenceScore * 100,
        passed: coherenceScore >= (criteria.coherence.threshold || 0.6)
      });
      totalScore += coherenceScore * 100;
      maxScore += 100;
    }

    // Evaluate factual accuracy
    if (criteria.factual_accuracy) {
      const accuracyScore = Math.random() * 0.4 + 0.6; // Simulate accuracy check
      evaluations.push({
        criterion: 'factual_accuracy',
        score: accuracyScore * 100,
        passed: accuracyScore >= (criteria.factual_accuracy.threshold || 0.8)
      });
      totalScore += accuracyScore * 100;
      maxScore += 100;
    }

    const overallScore = maxScore > 0 ? totalScore / maxScore * 100 : 0;
    const allPassed = evaluations.every(e => e.passed);

    return {
      score: overallScore,
      passed: allPassed,
      evaluations,
      summary: {
        total_criteria: evaluations.length,
        passed_criteria: evaluations.filter(e => e.passed).length,
        overall_score: overallScore
      }
    };
  }
}

/**
 * Code Function Validator
 */
class CodeFunctionValidator extends BaseValidator {
  async validate(testDefinition, expectedResult) {
    const { code, function_name, test_cases } = testDefinition;
    
    try {
      const results = [];
      
      for (const testCase of test_cases || []) {
        const result = await this.executeTestCase(code, function_name, testCase);
        results.push(result);
      }
      
      const passedTests = results.filter(r => r.passed).length;
      const totalTests = results.length;
      const score = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
      
      return {
        status: score >= 70 ? 'passed' : 'failed',
        score,
        maxScore: 100,
        details: {
          code,
          function_name,
          test_results: results,
          summary: {
            total_tests: totalTests,
            passed_tests: passedTests,
            success_rate: score
          }
        }
      };
      
    } catch (error) {
      return {
        status: 'error',
        score: 0,
        maxScore: 100,
        details: {
          error: error.message,
          code,
          function_name
        }
      };
    }
  }

  async executeTestCase(code, functionName, testCase) {
    // Simulate code execution (in production, use sandboxed execution)
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
    
    const { input, expected_output } = testCase;
    
    // Simulate execution result
    const success = Math.random() > 0.2; // 80% success rate
    const actualOutput = success ? expected_output : 'unexpected_result';
    
    return {
      input,
      expected_output,
      actual_output: actualOutput,
      passed: success,
      execution_time: Math.random() * 100 + 10
    };
  }
}

/**
 * API Endpoint Validator
 */
class APIEndpointValidator extends BaseValidator {
  async validate(testDefinition, expectedResult) {
    const { endpoint, method, headers, body, assertions } = testDefinition;
    
    try {
      // Simulate API call
      const response = await this.makeAPICall(endpoint, method, headers, body);
      
      // Validate response against assertions
      const validationResults = [];
      
      for (const assertion of assertions || []) {
        const result = this.validateAssertion(response, assertion);
        validationResults.push(result);
      }
      
      const passedAssertions = validationResults.filter(r => r.passed).length;
      const totalAssertions = validationResults.length;
      const score = totalAssertions > 0 ? (passedAssertions / totalAssertions) * 100 : 0;
      
      return {
        status: score >= 80 ? 'passed' : 'failed',
        score,
        maxScore: 100,
        details: {
          endpoint,
          method,
          response,
          assertion_results: validationResults,
          summary: {
            total_assertions: totalAssertions,
            passed_assertions: passedAssertions,
            success_rate: score
          }
        }
      };
      
    } catch (error) {
      return {
        status: 'error',
        score: 0,
        maxScore: 100,
        details: {
          error: error.message,
          endpoint,
          method
        }
      };
    }
  }

  async makeAPICall(endpoint, method, headers, body) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 500));
    
    // Simulate response
    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: { message: 'simulated response', data: { id: 1, name: 'test' } },
      response_time: Math.random() * 200 + 50
    };
  }

  validateAssertion(response, assertion) {
    const { type, field, operator, expected } = assertion;
    
    let actual;
    if (type === 'status') {
      actual = response.status;
    } else if (type === 'header') {
      actual = response.headers[field];
    } else if (type === 'body') {
      actual = field ? response.body[field] : response.body;
    }
    
    let passed = false;
    
    switch (operator) {
      case 'equals':
        passed = actual === expected;
        break;
      case 'not_equals':
        passed = actual !== expected;
        break;
      case 'contains':
        passed = typeof actual === 'string' && actual.includes(expected);
        break;
      case 'greater_than':
        passed = actual > expected;
        break;
      case 'less_than':
        passed = actual < expected;
        break;
      default:
        passed = false;
    }
    
    return {
      type,
      field,
      operator,
      expected,
      actual,
      passed
    };
  }
}

/**
 * Data Pipeline Validator
 */
class DataPipelineValidator extends BaseValidator {
  async validate(testDefinition, expectedResult) {
    // Simulate data pipeline validation
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
    
    const score = Math.random() * 40 + 60; // 60-100 range
    
    return {
      status: score >= 75 ? 'passed' : 'failed',
      score,
      maxScore: 100,
      details: {
        pipeline: testDefinition.pipeline_config,
        data_quality_score: score,
        simulated: true
      }
    };
  }
}

/**
 * UI Component Validator
 */
class UIComponentValidator extends BaseValidator {
  async validate(testDefinition, expectedResult) {
    // Simulate UI component validation
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1500));
    
    const score = Math.random() * 30 + 70; // 70-100 range
    
    return {
      status: score >= 80 ? 'passed' : 'failed',
      score,
      maxScore: 100,
      details: {
        component: testDefinition.component_config,
        visual_score: score,
        simulated: true
      }
    };
  }
}

// Create singleton instance
const validationEngine = new ValidationEngine();

module.exports = {
  ValidationEngine,
  validationEngine
};