const { DeepEvalMetrics } = require('../../src/services/deepeval-metrics');
const { DeepEvalReporter } = require('../../src/services/deepeval-reporter');

describe('DeepEvalMetrics', () => {
  let metrics;
  let reporter;

  beforeEach(() => {
    metrics = new DeepEvalMetrics();
    reporter = new DeepEvalReporter();
  });

  describe('Metrics Collection', () => {
    test('should initialize with default metrics', () => {
      expect(metrics.getMetrics()).toBeDefined();
      expect(metrics.getMetrics().evaluations).toBeDefined();
      expect(metrics.getMetrics().performance).toBeDefined();
      expect(metrics.getMetrics().quality).toBeDefined();
    });

    test('should record evaluation metrics', () => {
      const evaluationData = {
        testId: 'test-001',
        suite: 'correctness-suite',
        metrics: {
          correctness: { score: 0.85, verdict: 'PASS' },
          faithfulness: { score: 0.72, verdict: 'PASS' }
        },
        executionTime: 1500,
        timestamp: Date.now()
      };

      metrics.recordEvaluation(evaluationData);
      
      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.evaluations.total).toBe(1);
      expect(currentMetrics.evaluations.passed).toBe(1);
      expect(currentMetrics.evaluations.failed).toBe(0);
    });

    test('should calculate average scores', () => {
      const evaluations = [
        { metrics: { correctness: { score: 0.8 }, faithfulness: { score: 0.7 } } },
        { metrics: { correctness: { score: 0.9 }, faithfulness: { score: 0.8 } } },
        { metrics: { correctness: { score: 0.7 }, faithfulness: { score: 0.6 } } }
      ];

      evaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const averages = metrics.getAverageScores();
      expect(averages.correctness).toBeCloseTo(0.8, 1);
      expect(averages.faithfulness).toBeCloseTo(0.7, 1);
    });

    test('should track performance metrics', () => {
      const evaluationData = {
        testId: 'test-001',
        executionTime: 2000,
        metrics: { correctness: { score: 0.8 } }
      };

      metrics.recordEvaluation(evaluationData);
      
      const performance = metrics.getPerformanceMetrics();
      expect(performance.averageExecutionTime).toBe(2000);
      expect(performance.totalExecutions).toBe(1);
    });

    test('should calculate success rates', () => {
      const evaluations = [
        { metrics: { correctness: { score: 0.8, verdict: 'PASS' } } },
        { metrics: { correctness: { score: 0.9, verdict: 'PASS' } } },
        { metrics: { correctness: { score: 0.4, verdict: 'FAIL' } } }
      ];

      evaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const successRate = metrics.getSuccessRate();
      expect(successRate).toBeCloseTo(0.67, 2);
    });
  });

  describe('Metrics Aggregation', () => {
    test('should aggregate metrics by suite', () => {
      const evaluations = [
        { suite: 'suite-1', metrics: { correctness: { score: 0.8 } } },
        { suite: 'suite-1', metrics: { correctness: { score: 0.9 } } },
        { suite: 'suite-2', metrics: { correctness: { score: 0.7 } } }
      ];

      evaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const bySuite = metrics.getMetricsBySuite();
      expect(bySuite['suite-1'].averageScore).toBeCloseTo(0.85, 2);
      expect(bySuite['suite-2'].averageScore).toBeCloseTo(0.7, 2);
    });

    test('should aggregate metrics by metric type', () => {
      const evaluations = [
        { metrics: { correctness: { score: 0.8 }, faithfulness: { score: 0.7 } } },
        { metrics: { correctness: { score: 0.9 }, faithfulness: { score: 0.8 } } }
      ];

      evaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const byMetric = metrics.getMetricsByType();
      expect(byMetric.correctness.averageScore).toBeCloseTo(0.85, 2);
      expect(byMetric.faithfulness.averageScore).toBeCloseTo(0.75, 2);
    });

    test('should track trends over time', () => {
      const now = Date.now();
      const evaluations = [
        { timestamp: now - 3600000, metrics: { correctness: { score: 0.8 } } }, // 1 hour ago
        { timestamp: now - 1800000, metrics: { correctness: { score: 0.9 } } }, // 30 min ago
        { timestamp: now, metrics: { correctness: { score: 0.7 } } } // now
      ];

      evaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const trends = metrics.getTrends('hourly');
      expect(trends).toHaveLength(2); // Should have 2 hourly buckets
    });
  });

  describe('Quality Thresholds', () => {
    test('should set quality thresholds', () => {
      const thresholds = {
        correctness: 0.8,
        faithfulness: 0.7,
        answer_relevancy: 0.75
      };

      metrics.setQualityThresholds(thresholds);
      
      expect(metrics.getQualityThresholds()).toEqual(thresholds);
    });

    test('should evaluate against quality thresholds', () => {
      metrics.setQualityThresholds({
        correctness: 0.8,
        faithfulness: 0.7
      });

      const evaluation = {
        metrics: {
          correctness: { score: 0.85, verdict: 'PASS' },
          faithfulness: { score: 0.65, verdict: 'FAIL' }
        }
      };

      const result = metrics.evaluateQuality(evaluation);
      
      expect(result.overallPass).toBe(false);
      expect(result.passedMetrics).toContain('correctness');
      expect(result.failedMetrics).toContain('faithfulness');
    });

    test('should generate quality alerts', () => {
      const evaluations = [
        { metrics: { correctness: { score: 0.4 } } },
        { metrics: { correctness: { score: 0.3 } } },
        { metrics: { correctness: { score: 0.5 } } }
      ];

      evaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const alerts = metrics.getQualityAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('QUALITY_DEGRADATION');
      expect(alerts[0].metric).toBe('correctness');
    });
  });

  describe('Reporting', () => {
    test('should generate summary report', () => {
      const evaluations = [
        { 
          testId: 'test-1',
          suite: 'suite-1',
          metrics: { correctness: { score: 0.8, verdict: 'PASS' } },
          executionTime: 1000
        },
        { 
          testId: 'test-2',
          suite: 'suite-1',
          metrics: { correctness: { score: 0.9, verdict: 'PASS' } },
          executionTime: 1200
        }
      ];

      evaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const report = reporter.generateSummaryReport(metrics.getMetrics());
      
      expect(report.totalEvaluations).toBe(2);
      expect(report.successRate).toBeCloseTo(1.0, 2);
      expect(report.averageScore).toBeCloseTo(0.85, 2);
      expect(report.averageExecutionTime).toBe(1100);
    });

    test('should generate detailed report', () => {
      const evaluations = [
        { 
          testId: 'test-1',
          suite: 'suite-1',
          metrics: { 
            correctness: { score: 0.8, verdict: 'PASS', reason: 'Accurate response' },
            faithfulness: { score: 0.7, verdict: 'PASS', reason: 'Faithful to context' }
          },
          executionTime: 1000
        }
      ];

      evaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const report = reporter.generateDetailedReport(metrics.getMetrics());
      
      expect(report.evaluationDetails).toHaveLength(1);
      expect(report.evaluationDetails[0].testId).toBe('test-1');
      expect(report.evaluationDetails[0].metrics.correctness.score).toBe(0.8);
      expect(report.metricBreakdown).toBeDefined();
    });

    test('should export metrics to different formats', () => {
      const evaluations = [
        { metrics: { correctness: { score: 0.8 } } },
        { metrics: { correctness: { score: 0.9 } } }
      ];

      evaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const jsonExport = metrics.exportMetrics('json');
      expect(typeof jsonExport).toBe('string');
      expect(() => JSON.parse(jsonExport)).not.toThrow();
      
      const csvExport = metrics.exportMetrics('csv');
      expect(typeof csvExport).toBe('string');
      expect(csvExport).toContain('testId,suite,correctness');
    });
  });

  describe('Real-time Monitoring', () => {
    test('should support real-time metrics updates', () => {
      const callback = jest.fn();
      metrics.onMetricsUpdate(callback);
      
      const evaluation = {
        metrics: { correctness: { score: 0.8 } }
      };
      
      metrics.recordEvaluation(evaluation);
      
      expect(callback).toHaveBeenCalledWith(metrics.getMetrics());
    });

    test('should detect performance degradation', () => {
      const slowEvaluations = [
        { executionTime: 5000, metrics: { correctness: { score: 0.8 } } },
        { executionTime: 6000, metrics: { correctness: { score: 0.8 } } },
        { executionTime: 7000, metrics: { correctness: { score: 0.8 } } }
      ];

      slowEvaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const alerts = metrics.getPerformanceAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].type).toBe('PERFORMANCE_DEGRADATION');
      expect(alerts[0].metric).toBe('executionTime');
    });

    test('should provide metrics dashboard data', () => {
      const evaluations = [
        { 
          suite: 'suite-1',
          metrics: { correctness: { score: 0.8 }, faithfulness: { score: 0.7 } },
          executionTime: 1000,
          timestamp: Date.now()
        }
      ];

      evaluations.forEach(eval => metrics.recordEvaluation(eval));
      
      const dashboardData = metrics.getDashboardData();
      
      expect(dashboardData.overview).toBeDefined();
      expect(dashboardData.trends).toBeDefined();
      expect(dashboardData.alerts).toBeDefined();
      expect(dashboardData.topPerformers).toBeDefined();
    });
  });
});