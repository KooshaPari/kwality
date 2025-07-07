const { DeepEvalFramework } = require('../../src/services/deepeval-framework');
const { DeepEvalValidator } = require('../../src/services/deepeval-validator');
const { DeepEvalMetrics } = require('../../src/services/deepeval-metrics');

describe('DeepEvalFramework', () => {
  let framework;
  let validator;
  let metrics;

  beforeEach(() => {
    framework = new DeepEvalFramework();
    validator = new DeepEvalValidator();
    metrics = new DeepEvalMetrics();
  });

  describe('Framework Initialization', () => {
    test('should initialize with default configuration', () => {
      expect(framework).toBeDefined();
      expect(framework.config).toBeDefined();
      expect(framework.config.evaluationMetrics).toEqual([
        'correctness',
        'faithfulness',
        'answer_relevancy',
        'contextual_recall',
        'contextual_precision',
        'harmlessness',
        'bias',
        'toxicity',
        'hallucination'
      ]);
    });

    test('should initialize with custom configuration', () => {
      const customConfig = {
        evaluationMetrics: ['correctness', 'faithfulness'],
        thresholds: { correctness: 0.8, faithfulness: 0.7 }
      };
      const customFramework = new DeepEvalFramework(customConfig);
      
      expect(customFramework.config.evaluationMetrics).toEqual(['correctness', 'faithfulness']);
      expect(customFramework.config.thresholds.correctness).toBe(0.8);
    });

    test('should register all default evaluators', () => {
      expect(framework.evaluators.size).toBe(9);
      expect(framework.evaluators.has('correctness')).toBe(true);
      expect(framework.evaluators.has('faithfulness')).toBe(true);
      expect(framework.evaluators.has('answer_relevancy')).toBe(true);
    });
  });

  describe('Test Suite Management', () => {
    test('should create a new test suite', async () => {
      const suiteConfig = {
        name: 'LLM Response Validation',
        description: 'Comprehensive LLM response evaluation',
        metrics: ['correctness', 'faithfulness', 'answer_relevancy']
      };

      const suite = await framework.createTestSuite(suiteConfig);
      
      expect(suite).toBeDefined();
      expect(suite.id).toBeDefined();
      expect(suite.name).toBe(suiteConfig.name);
      expect(suite.metrics).toEqual(suiteConfig.metrics);
    });

    test('should validate test suite configuration', async () => {
      const invalidConfig = {
        name: '',
        metrics: ['invalid_metric']
      };

      await expect(framework.createTestSuite(invalidConfig))
        .rejects.toThrow('Invalid test suite configuration');
    });

    test('should add test cases to suite', async () => {
      const suite = await framework.createTestSuite({
        name: 'Test Suite',
        metrics: ['correctness']
      });

      const testCase = {
        name: 'Basic correctness test',
        prompt: 'What is 2+2?',
        expectedAnswer: '4',
        context: 'Mathematical calculation',
        metrics: ['correctness']
      };

      await framework.addTestCase(suite.id, testCase);
      const updatedSuite = await framework.getTestSuite(suite.id);
      
      expect(updatedSuite.testCases).toHaveLength(1);
      expect(updatedSuite.testCases[0].name).toBe(testCase.name);
    });
  });

  describe('Evaluation Execution', () => {
    test('should execute single evaluation', async () => {
      const evaluationRequest = {
        prompt: 'What is the capital of France?',
        response: 'The capital of France is Paris.',
        context: 'Geography question about European capitals',
        metrics: ['correctness', 'answer_relevancy']
      };

      const result = await framework.evaluate(evaluationRequest);
      
      expect(result).toBeDefined();
      expect(result.overall_score).toBeDefined();
      expect(result.metric_scores).toBeDefined();
      expect(result.metric_scores.correctness).toBeDefined();
      expect(result.metric_scores.answer_relevancy).toBeDefined();
    });

    test('should execute test suite', async () => {
      const suite = await framework.createTestSuite({
        name: 'Geography Test Suite',
        metrics: ['correctness', 'answer_relevancy']
      });

      await framework.addTestCase(suite.id, {
        name: 'Capital of France',
        prompt: 'What is the capital of France?',
        expectedAnswer: 'Paris',
        context: 'European geography'
      });

      const mockLLMResponse = 'The capital of France is Paris.';
      const results = await framework.executeTestSuite(suite.id, mockLLMResponse);
      
      expect(results).toBeDefined();
      expect(results.suite_id).toBe(suite.id);
      expect(results.test_results).toHaveLength(1);
      expect(results.overall_score).toBeDefined();
    });

    test('should handle evaluation errors gracefully', async () => {
      const invalidRequest = {
        prompt: '',
        response: null,
        metrics: ['correctness']
      };

      await expect(framework.evaluate(invalidRequest))
        .rejects.toThrow('Invalid evaluation request');
    });
  });

  describe('Metrics and Scoring', () => {
    test('should calculate weighted scores', () => {
      const metricScores = {
        correctness: 0.8,
        faithfulness: 0.9,
        answer_relevancy: 0.7
      };
      
      const weights = {
        correctness: 0.4,
        faithfulness: 0.3,
        answer_relevancy: 0.3
      };

      const weightedScore = framework.calculateWeightedScore(metricScores, weights);
      
      expect(weightedScore).toBeCloseTo(0.8, 2);
    });

    test('should determine pass/fail based on thresholds', () => {
      const metricScores = {
        correctness: 0.8,
        faithfulness: 0.6,
        answer_relevancy: 0.9
      };
      
      const thresholds = {
        correctness: 0.7,
        faithfulness: 0.8,
        answer_relevancy: 0.8
      };

      const result = framework.evaluateThresholds(metricScores, thresholds);
      
      expect(result.passed).toBe(false);
      expect(result.failedMetrics).toContain('faithfulness');
      expect(result.passedMetrics).toContain('correctness');
    });

    test('should generate detailed evaluation report', async () => {
      const evaluationRequest = {
        prompt: 'Explain photosynthesis',
        response: 'Photosynthesis is the process by which plants convert light energy into chemical energy.',
        context: 'Biology education context',
        metrics: ['correctness', 'answer_relevancy']
      };

      const result = await framework.evaluate(evaluationRequest);
      const report = framework.generateReport(result);
      
      expect(report).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.detailed_metrics).toBeDefined();
      expect(report.recommendations).toBeDefined();
    });
  });

  describe('Advanced Features', () => {
    test('should support custom evaluators', () => {
      const customEvaluator = {
        name: 'custom_metric',
        evaluate: jest.fn().mockResolvedValue(0.75)
      };

      framework.registerEvaluator(customEvaluator);
      
      expect(framework.evaluators.has('custom_metric')).toBe(true);
    });

    test('should support batch evaluation', async () => {
      const batchRequest = {
        evaluations: [
          {
            prompt: 'What is 2+2?',
            response: '4',
            metrics: ['correctness']
          },
          {
            prompt: 'What is the capital of Spain?',
            response: 'Madrid',
            metrics: ['correctness']
          }
        ]
      };

      const results = await framework.evaluateBatch(batchRequest);
      
      expect(results).toHaveLength(2);
      expect(results[0].metric_scores.correctness).toBeDefined();
      expect(results[1].metric_scores.correctness).toBeDefined();
    });

    test('should export evaluation results', async () => {
      const suite = await framework.createTestSuite({
        name: 'Export Test Suite',
        metrics: ['correctness']
      });

      const exportData = await framework.exportResults(suite.id, 'json');
      
      expect(exportData).toBeDefined();
      expect(typeof exportData).toBe('string');
      expect(() => JSON.parse(exportData)).not.toThrow();
    });
  });

  describe('Integration with Validation Engine', () => {
    test('should integrate with existing validation engine', () => {
      const validationEngine = framework.getValidationEngine();
      
      expect(validationEngine).toBeDefined();
      expect(validationEngine.validators.has('deepeval')).toBe(true);
    });

    test('should register as LLM validator', () => {
      const validator = framework.getLLMValidator();
      
      expect(validator).toBeDefined();
      expect(validator.validate).toBeDefined();
      expect(typeof validator.validate).toBe('function');
    });
  });
});