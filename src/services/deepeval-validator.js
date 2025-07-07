class DeepEvalValidator {
  constructor() {
    this.validationRules = {
      prompt: {
        required: true,
        minLength: 1,
        maxLength: 10000
      },
      response: {
        required: true,
        minLength: 1,
        maxLength: 50000
      },
      context: {
        required: false,
        maxLength: 20000
      },
      metrics: {
        required: true,
        validValues: [
          'correctness',
          'faithfulness',
          'answer_relevancy',
          'contextual_recall',
          'contextual_precision',
          'harmlessness',
          'bias',
          'toxicity',
          'hallucination'
        ]
      }
    };
  }

  validateEvaluationRequest(request) {
    const errors = [];

    // Validate prompt
    if (!this._validateField(request.prompt, this.validationRules.prompt)) {
      errors.push('Invalid prompt: must be a non-empty string with max length 10000');
    }

    // Validate response
    if (!this._validateField(request.response, this.validationRules.response)) {
      errors.push('Invalid response: must be a non-empty string with max length 50000');
    }

    // Validate context (optional)
    if (request.context !== undefined && !this._validateField(request.context, this.validationRules.context)) {
      errors.push('Invalid context: must be a string with max length 20000');
    }

    // Validate metrics
    if (!this._validateMetrics(request.metrics)) {
      errors.push('Invalid metrics: must be an array of valid metric names');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateTestSuiteConfig(config) {
    const errors = [];

    // Validate name
    if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
      errors.push('Test suite name is required and must be a non-empty string');
    }

    // Validate description (optional)
    if (config.description !== undefined && typeof config.description !== 'string') {
      errors.push('Test suite description must be a string');
    }

    // Validate metrics
    if (config.metrics && !this._validateMetrics(config.metrics)) {
      errors.push('Invalid metrics in test suite configuration');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateTestCase(testCase) {
    const errors = [];

    // Validate name
    if (!testCase.name || typeof testCase.name !== 'string' || testCase.name.trim() === '') {
      errors.push('Test case name is required and must be a non-empty string');
    }

    // Validate prompt
    if (!this._validateField(testCase.prompt, this.validationRules.prompt)) {
      errors.push('Invalid test case prompt');
    }

    // Validate expected answer (optional)
    if (testCase.expectedAnswer !== undefined && typeof testCase.expectedAnswer !== 'string') {
      errors.push('Expected answer must be a string');
    }

    // Validate context (optional)
    if (testCase.context !== undefined && !this._validateField(testCase.context, this.validationRules.context)) {
      errors.push('Invalid test case context');
    }

    // Validate metrics (optional)
    if (testCase.metrics && !this._validateMetrics(testCase.metrics)) {
      errors.push('Invalid metrics in test case');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateBatchRequest(batchRequest) {
    const errors = [];

    // Validate evaluations array
    if (!Array.isArray(batchRequest.evaluations)) {
      errors.push('Batch request must contain an evaluations array');
      return { isValid: false, errors };
    }

    if (batchRequest.evaluations.length === 0) {
      errors.push('Batch request must contain at least one evaluation');
    }

    // Validate each evaluation
    batchRequest.evaluations.forEach((evaluation, index) => {
      const validation = this.validateEvaluationRequest(evaluation);
      if (!validation.isValid) {
        errors.push(`Evaluation ${index + 1}: ${validation.errors.join(', ')}`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateMetricScores(metricScores) {
    const errors = [];

    if (!metricScores || typeof metricScores !== 'object') {
      errors.push('Metric scores must be an object');
      return { isValid: false, errors };
    }

    Object.entries(metricScores).forEach(([metric, score]) => {
      if (!this.validationRules.metrics.validValues.includes(metric)) {
        errors.push(`Invalid metric: ${metric}`);
      }

      if (typeof score !== 'number' || isNaN(score) || score < 0 || score > 1) {
        errors.push(`Invalid score for metric ${metric}: must be a number between 0 and 1`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateThresholds(thresholds) {
    const errors = [];

    if (!thresholds || typeof thresholds !== 'object') {
      errors.push('Thresholds must be an object');
      return { isValid: false, errors };
    }

    Object.entries(thresholds).forEach(([metric, threshold]) => {
      if (!this.validationRules.metrics.validValues.includes(metric)) {
        errors.push(`Invalid metric in thresholds: ${metric}`);
      }

      if (typeof threshold !== 'number' || isNaN(threshold) || threshold < 0 || threshold > 1) {
        errors.push(`Invalid threshold for metric ${metric}: must be a number between 0 and 1`);
      }
    });

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateWeights(weights) {
    const errors = [];

    if (!weights || typeof weights !== 'object') {
      errors.push('Weights must be an object');
      return { isValid: false, errors };
    }

    let totalWeight = 0;
    Object.entries(weights).forEach(([metric, weight]) => {
      if (!this.validationRules.metrics.validValues.includes(metric)) {
        errors.push(`Invalid metric in weights: ${metric}`);
      }

      if (typeof weight !== 'number' || isNaN(weight) || weight < 0 || weight > 1) {
        errors.push(`Invalid weight for metric ${metric}: must be a number between 0 and 1`);
      }

      totalWeight += weight;
    });

    if (Math.abs(totalWeight - 1) > 0.01) {
      errors.push('Weights must sum to 1.0');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  sanitizeInput(input) {
    if (typeof input !== 'string') {
      return input;
    }

    // Remove potentially harmful characters
    return input
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: URLs
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  }

  _validateField(value, rules) {
    // Check required
    if (rules.required && (value === undefined || value === null)) {
      return false;
    }

    // If not required and undefined, it's valid
    if (!rules.required && value === undefined) {
      return true;
    }

    // Check type
    if (typeof value !== 'string') {
      return false;
    }

    // Check length constraints
    if (rules.minLength && value.length < rules.minLength) {
      return false;
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      return false;
    }

    return true;
  }

  _validateMetrics(metrics) {
    if (!Array.isArray(metrics)) {
      return false;
    }

    if (metrics.length === 0) {
      return false;
    }

    return metrics.every(metric => 
      this.validationRules.metrics.validValues.includes(metric)
    );
  }

  getValidationRules() {
    return this.validationRules;
  }

  updateValidationRules(rules) {
    this.validationRules = { ...this.validationRules, ...rules };
  }
}

module.exports = { DeepEvalValidator };