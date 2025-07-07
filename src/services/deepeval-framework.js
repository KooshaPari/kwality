const { DeepEvalValidator } = require('./deepeval-validator');
const { DeepEvalMetrics } = require('./deepeval-metrics');
const { v4: uuidv4 } = require('uuid');

class DeepEvalFramework {
  constructor(config = {}) {
    this.config = {
      evaluationMetrics: [
        'correctness',
        'faithfulness',
        'answer_relevancy',
        'contextual_recall',
        'contextual_precision',
        'harmlessness',
        'bias',
        'toxicity',
        'hallucination'
      ],
      thresholds: {
        correctness: 0.7,
        faithfulness: 0.7,
        answer_relevancy: 0.7,
        contextual_recall: 0.7,
        contextual_precision: 0.7,
        harmlessness: 0.8,
        bias: 0.2,
        toxicity: 0.2,
        hallucination: 0.3
      },
      weights: {
        correctness: 0.3,
        faithfulness: 0.2,
        answer_relevancy: 0.2,
        contextual_recall: 0.1,
        contextual_precision: 0.1,
        harmlessness: 0.1
      },
      ...config
    };

    this.evaluators = new Map();
    this.testSuites = new Map();
    this.validator = new DeepEvalValidator();
    this.metrics = new DeepEvalMetrics();
    
    this._initializeEvaluators();
  }

  _initializeEvaluators() {
    // Register default evaluators
    this.config.evaluationMetrics.forEach(metric => {
      this.evaluators.set(metric, this.metrics.getEvaluator(metric));
    });
  }

  async createTestSuite(suiteConfig) {
    // Validate configuration
    if (!suiteConfig.name || suiteConfig.name.trim() === '') {
      throw new Error('Invalid test suite configuration');
    }

    if (suiteConfig.metrics && !suiteConfig.metrics.every(metric => 
      this.config.evaluationMetrics.includes(metric))) {
      throw new Error('Invalid test suite configuration');
    }

    const suite = {
      id: uuidv4(),
      name: suiteConfig.name,
      description: suiteConfig.description || '',
      metrics: suiteConfig.metrics || this.config.evaluationMetrics,
      testCases: [],
      created: new Date(),
      updated: new Date()
    };

    this.testSuites.set(suite.id, suite);
    return suite;
  }

  async getTestSuite(suiteId) {
    return this.testSuites.get(suiteId);
  }

  async addTestCase(suiteId, testCase) {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error('Test suite not found');
    }

    const testCaseWithId = {
      id: uuidv4(),
      ...testCase,
      created: new Date()
    };

    suite.testCases.push(testCaseWithId);
    suite.updated = new Date();
  }

  async evaluate(evaluationRequest) {
    // Validate request
    if (!evaluationRequest.prompt || evaluationRequest.response === null || evaluationRequest.response === undefined) {
      throw new Error('Invalid evaluation request');
    }

    const { prompt, response, context, metrics = ['correctness'] } = evaluationRequest;
    
    const metricScores = {};
    
    // Execute each metric evaluation
    for (const metric of metrics) {
      const evaluator = this.evaluators.get(metric);
      if (evaluator) {
        try {
          metricScores[metric] = await evaluator.evaluate({
            prompt,
            response,
            context,
            expected: evaluationRequest.expectedAnswer
          });
        } catch (error) {
          console.error(`Error evaluating metric ${metric}:`, error);
          metricScores[metric] = 0;
        }
      }
    }

    // Calculate overall score
    const weights = {};
    metrics.forEach(metric => {
      weights[metric] = this.config.weights[metric] || (1 / metrics.length);
    });

    const overallScore = this.calculateWeightedScore(metricScores, weights);

    return {
      overall_score: overallScore,
      metric_scores: metricScores,
      evaluation_id: uuidv4(),
      timestamp: new Date(),
      request: evaluationRequest
    };
  }

  async executeTestSuite(suiteId, llmResponse) {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error('Test suite not found');
    }

    const testResults = [];
    
    for (const testCase of suite.testCases) {
      const evaluationRequest = {
        prompt: testCase.prompt,
        response: llmResponse,
        context: testCase.context,
        expectedAnswer: testCase.expectedAnswer,
        metrics: testCase.metrics || suite.metrics
      };

      const result = await this.evaluate(evaluationRequest);
      testResults.push({
        test_case_id: testCase.id,
        test_case_name: testCase.name,
        ...result
      });
    }

    // Calculate suite-level metrics
    const suiteScores = {};
    suite.metrics.forEach(metric => {
      const scores = testResults.map(r => r.metric_scores[metric]).filter(s => s !== undefined);
      suiteScores[metric] = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    });

    const suiteOverallScore = this.calculateWeightedScore(suiteScores, this.config.weights);

    return {
      suite_id: suiteId,
      suite_name: suite.name,
      test_results: testResults,
      overall_score: suiteOverallScore,
      suite_scores: suiteScores,
      executed_at: new Date()
    };
  }

  calculateWeightedScore(metricScores, weights) {
    let totalScore = 0;
    let totalWeight = 0;

    Object.entries(metricScores).forEach(([metric, score]) => {
      const weight = weights[metric] || 0;
      totalScore += score * weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  evaluateThresholds(metricScores, thresholds) {
    const passedMetrics = [];
    const failedMetrics = [];

    Object.entries(metricScores).forEach(([metric, score]) => {
      const threshold = thresholds[metric];
      if (threshold !== undefined) {
        if (score >= threshold) {
          passedMetrics.push(metric);
        } else {
          failedMetrics.push(metric);
        }
      }
    });

    return {
      passed: failedMetrics.length === 0,
      passedMetrics,
      failedMetrics
    };
  }

  generateReport(evaluationResult) {
    const { overall_score, metric_scores, request } = evaluationResult;
    
    const thresholdResult = this.evaluateThresholds(metric_scores, this.config.thresholds);
    
    const summary = {
      overall_score,
      passed: thresholdResult.passed,
      total_metrics: Object.keys(metric_scores).length,
      passed_metrics: thresholdResult.passedMetrics.length,
      failed_metrics: thresholdResult.failedMetrics.length
    };

    const detailedMetrics = Object.entries(metric_scores).map(([metric, score]) => {
      const threshold = this.config.thresholds[metric];
      return {
        metric,
        score,
        threshold,
        passed: threshold ? score >= threshold : true,
        weight: this.config.weights[metric] || 0
      };
    });

    const recommendations = [];
    if (thresholdResult.failedMetrics.length > 0) {
      recommendations.push(`Improve performance in: ${thresholdResult.failedMetrics.join(', ')}`);
    }
    if (overall_score < 0.7) {
      recommendations.push('Overall score is below recommended threshold of 0.7');
    }

    return {
      summary,
      detailed_metrics: detailedMetrics,
      recommendations,
      timestamp: new Date()
    };
  }

  registerEvaluator(evaluator) {
    this.evaluators.set(evaluator.name, evaluator);
  }

  async evaluateBatch(batchRequest) {
    const results = [];
    
    for (const evaluation of batchRequest.evaluations) {
      const result = await this.evaluate(evaluation);
      results.push(result);
    }

    return results;
  }

  async exportResults(suiteId, format = 'json') {
    const suite = this.testSuites.get(suiteId);
    if (!suite) {
      throw new Error('Test suite not found');
    }

    const exportData = {
      suite_id: suiteId,
      suite_name: suite.name,
      suite_description: suite.description,
      test_cases: suite.testCases,
      exported_at: new Date()
    };

    if (format === 'json') {
      return JSON.stringify(exportData, null, 2);
    }

    throw new Error(`Unsupported export format: ${format}`);
  }

  getValidationEngine() {
    return {
      validators: new Map([
        ['deepeval', this.validator]
      ])
    };
  }

  getLLMValidator() {
    return {
      validate: async (prompt, response, context, metrics) => {
        return await this.evaluate({
          prompt,
          response,
          context,
          metrics
        });
      }
    };
  }
}

module.exports = { DeepEvalFramework };