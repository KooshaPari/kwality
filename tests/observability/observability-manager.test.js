const { ObservabilityManager } = require('../../src/services/observability-manager');

describe('ObservabilityManager', () => {
  let observabilityManager;

  beforeEach(() => {
    observabilityManager = new ObservabilityManager();
  });

  afterEach(async () => {
    if (observabilityManager) {
      await observabilityManager.shutdown();
    }
  });

  describe('Initialization', () => {
    test('should initialize with default state', () => {
      expect(observabilityManager.isConfigured).toBe(false);
      expect(observabilityManager.tracer).toBeNull();
      expect(observabilityManager.meter).toBeNull();
      expect(observabilityManager.config).toEqual({});
      expect(observabilityManager.activeSpans).toBeInstanceOf(Map);
      expect(observabilityManager.metrics).toBeDefined();
    });

    test('should configure with default settings when enabled', () => {
      const config = { enabled: true };
      
      observabilityManager.configure(config);
      
      expect(observabilityManager.isConfigured).toBe(true);
      expect(observabilityManager.config.enabled).toBe(true);
      expect(observabilityManager.config.serviceName).toBe('kwality-validation');
      expect(observabilityManager.config.environment).toBe('development');
      expect(observabilityManager.config.endpoint).toBe('http://localhost:4317');
      expect(observabilityManager.config.samplingRate).toBe(1.0);
    });

    test('should configure with custom settings', () => {
      const config = {
        enabled: true,
        serviceName: 'custom-service',
        environment: 'production',
        endpoint: 'http://custom:4317',
        samplingRate: 0.5,
        headers: { 'x-api-key': 'test' }
      };
      
      observabilityManager.configure(config);
      
      expect(observabilityManager.config.serviceName).toBe('custom-service');
      expect(observabilityManager.config.environment).toBe('production');
      expect(observabilityManager.config.endpoint).toBe('http://custom:4317');
      expect(observabilityManager.config.samplingRate).toBe(0.5);
      expect(observabilityManager.config.headers).toEqual({ 'x-api-key': 'test' });
    });

    test('should not initialize OpenTelemetry when disabled', () => {
      const config = { enabled: false };
      
      observabilityManager.configure(config);
      
      expect(observabilityManager.isConfigured).toBe(true);
      expect(observabilityManager.tracer).toBeNull();
      expect(observabilityManager.meter).toBeNull();
    });

    test('should initialize OpenTelemetry when enabled', () => {
      const config = { enabled: true };
      
      observabilityManager.configure(config);
      
      expect(observabilityManager.tracer).toBeDefined();
      expect(observabilityManager.meter).toBeDefined();
      expect(observabilityManager.metrics.counters.size).toBeGreaterThan(0);
      expect(observabilityManager.metrics.histograms.size).toBeGreaterThan(0);
      expect(observabilityManager.metrics.gauges.size).toBeGreaterThan(0);
    });
  });

  describe('Metrics Management', () => {
    beforeEach(() => {
      observabilityManager.configure({ enabled: true });
    });

    test('should initialize default metrics', () => {
      expect(observabilityManager.metrics.counters.has('validation_executions_total')).toBe(true);
      expect(observabilityManager.metrics.counters.has('validation_errors_total')).toBe(true);
      expect(observabilityManager.metrics.histograms.has('validation_duration_seconds')).toBe(true);
      expect(observabilityManager.metrics.histograms.has('validation_score')).toBe(true);
      expect(observabilityManager.metrics.gauges.has('active_validations')).toBe(true);
    });

    test('should record metrics', () => {
      const metricName = 'validation_executions_total';
      const attributes = { type: 'test' };
      
      observabilityManager.recordMetric(metricName, 1, attributes);
      
      const counter = observabilityManager.metrics.counters.get(metricName);
      expect(counter.value).toBe(1);
    });

    test('should record validation execution metrics', () => {
      const type = 'deepeval';
      const status = 'success';
      const duration = 1.5;
      const score = 0.85;
      
      observabilityManager.recordValidationExecution(type, status, duration, score);
      
      const executionsCounter = observabilityManager.metrics.counters.get('validation_executions_total');
      const durationHistogram = observabilityManager.metrics.histograms.get('validation_duration_seconds');
      const scoreHistogram = observabilityManager.metrics.histograms.get('validation_score');
      
      expect(executionsCounter.value).toBe(1);
      expect(durationHistogram.values).toHaveLength(1);
      expect(durationHistogram.values[0].value).toBe(duration);
      expect(scoreHistogram.values).toHaveLength(1);
      expect(scoreHistogram.values[0].value).toBe(score);
    });

    test('should record validation errors', () => {
      const type = 'deepeval';
      const status = 'error';
      const duration = 0.5;
      
      observabilityManager.recordValidationExecution(type, status, duration);
      
      const executionsCounter = observabilityManager.metrics.counters.get('validation_executions_total');
      const errorsCounter = observabilityManager.metrics.counters.get('validation_errors_total');
      
      expect(executionsCounter.value).toBe(1);
      expect(errorsCounter.value).toBe(1);
    });

    test('should update active validations gauge', () => {
      const count = 5;
      
      observabilityManager.updateActiveValidations(count);
      
      const gauge = observabilityManager.metrics.gauges.get('active_validations');
      expect(gauge.value).toBe(count);
    });

    test('should not record metrics when not configured', () => {
      const unconfiguredManager = new ObservabilityManager();
      
      expect(() => {
        unconfiguredManager.recordMetric('test_metric', 1);
      }).not.toThrow();
    });
  });

  describe('Span Management', () => {
    beforeEach(() => {
      observabilityManager.configure({ enabled: true });
    });

    test('should start span with default attributes', () => {
      const operationName = 'test_operation';
      const span = observabilityManager.startSpan(operationName);
      
      expect(span).toBeDefined();
      expect(span.operationName).toBe(operationName);
      expect(span.attributes['service.name']).toBe('kwality-validation');
      expect(span.attributes['service.version']).toBe('1.0.0');
      expect(span.attributes['deployment.environment']).toBe('development');
      expect(observabilityManager.activeSpans.has(span.spanId)).toBe(true);
    });

    test('should start span with custom attributes', () => {
      const operationName = 'test_operation';
      const customAttributes = { 'custom.attribute': 'value' };
      const span = observabilityManager.startSpan(operationName, customAttributes);
      
      expect(span.attributes['custom.attribute']).toBe('value');
    });

    test('should return mock span when not configured', () => {
      const unconfiguredManager = new ObservabilityManager();
      const span = unconfiguredManager.startSpan('test');
      
      expect(span).toBeDefined();
      expect(span.operationName).toBe('test');
    });

    test('should get active spans', () => {
      const span1 = observabilityManager.startSpan('operation1');
      const span2 = observabilityManager.startSpan('operation2');
      
      const activeSpans = observabilityManager.getActiveSpans();
      
      expect(activeSpans).toHaveLength(2);
      expect(activeSpans).toContain(span1);
      expect(activeSpans).toContain(span2);
    });
  });

  describe('Tracing Context', () => {
    beforeEach(() => {
      observabilityManager.configure({ enabled: true });
    });

    test('should execute function with tracing context', async () => {
      const operationName = 'test_operation';
      const mockFn = jest.fn().mockResolvedValue('result');
      
      const result = await observabilityManager.withTracing(operationName, mockFn);
      
      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledWith(expect.any(Object));
      
      const span = mockFn.mock.calls[0][0];
      expect(span.operationName).toBe(operationName);
      expect(span.status.code).toBe(1); // OK
      expect(span.endTime).toBeDefined();
    });

    test('should handle errors in tracing context', async () => {
      const operationName = 'test_operation';
      const error = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(error);
      
      await expect(observabilityManager.withTracing(operationName, mockFn))
        .rejects.toThrow('Test error');
      
      const span = mockFn.mock.calls[0][0];
      expect(span.status.code).toBe(2); // ERROR
      expect(span.status.message).toBe('Test error');
      expect(span.exceptions).toHaveLength(1);
      expect(span.exceptions[0].exception).toBe(error);
    });

    test('should execute with custom attributes', async () => {
      const operationName = 'test_operation';
      const attributes = { 'operation.type': 'validation' };
      const mockFn = jest.fn().mockResolvedValue('result');
      
      await observabilityManager.withTracing(operationName, mockFn, attributes);
      
      const span = mockFn.mock.calls[0][0];
      expect(span.attributes['operation.type']).toBe('validation');
    });
  });

  describe('Status and Health', () => {
    test('should return status when not configured', () => {
      const status = observabilityManager.getStatus();
      
      expect(status.configured).toBe(false);
      expect(status.enabled).toBeUndefined();
      expect(status.activeSpans).toBe(0);
      expect(status.metrics.counters).toBe(0);
      expect(status.metrics.histograms).toBe(0);
      expect(status.metrics.gauges).toBe(0);
    });

    test('should return status when configured and disabled', () => {
      observabilityManager.configure({ enabled: false });
      const status = observabilityManager.getStatus();
      
      expect(status.configured).toBe(true);
      expect(status.enabled).toBe(false);
      expect(status.serviceName).toBe('kwality-validation'); // Default service name is still set
    });

    test('should return status when configured and enabled', () => {
      observabilityManager.configure({ 
        enabled: true,
        serviceName: 'test-service',
        environment: 'test'
      });
      
      const span = observabilityManager.startSpan('test');
      const status = observabilityManager.getStatus();
      
      expect(status.configured).toBe(true);
      expect(status.enabled).toBe(true);
      expect(status.serviceName).toBe('test-service');
      expect(status.environment).toBe('test');
      expect(status.activeSpans).toBe(1);
      expect(status.metrics.counters).toBeGreaterThan(0);
      expect(status.metrics.histograms).toBeGreaterThan(0);
      expect(status.metrics.gauges).toBeGreaterThan(0);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully when not configured', async () => {
      await expect(observabilityManager.shutdown()).resolves.not.toThrow();
      expect(observabilityManager.isConfigured).toBe(false);
    });

    test('should shutdown gracefully when configured', async () => {
      observabilityManager.configure({ enabled: true });
      observabilityManager.startSpan('test');
      
      expect(observabilityManager.activeSpans.size).toBe(1);
      
      await observabilityManager.shutdown();
      
      expect(observabilityManager.isConfigured).toBe(false);
      expect(observabilityManager.activeSpans.size).toBe(0);
    });
  });

  describe('Mock Components', () => {
    beforeEach(() => {
      observabilityManager.configure({ enabled: true });
    });

    test('should create functional mock span', () => {
      const span = observabilityManager.startSpan('test_operation');
      
      // Test span methods
      span.setAttribute('test.key', 'test.value');
      expect(span.attributes['test.key']).toBe('test.value');
      
      span.setAttributes({ 'batch.key': 'batch.value' });
      expect(span.attributes['batch.key']).toBe('batch.value');
      
      span.addEvent('test_event', { 'event.data': 'data' });
      expect(span.events).toHaveLength(1);
      expect(span.events[0].name).toBe('test_event');
      
      const error = new Error('Test error');
      span.recordException(error);
      expect(span.exceptions).toHaveLength(1);
      expect(span.exceptions[0].exception).toBe(error);
      
      span.setStatus({ code: 1, message: 'OK' });
      expect(span.status.code).toBe(1);
      
      span.end();
      expect(span.endTime).toBeDefined();
    });

    test('should create functional mock counter', () => {
      const counter = observabilityManager.metrics.counters.get('validation_executions_total');
      
      expect(counter.value).toBe(0);
      
      counter.record(1, { type: 'test' });
      expect(counter.value).toBe(1);
      
      counter.record(5, { type: 'batch' });
      expect(counter.value).toBe(6);
    });

    test('should create functional mock histogram', () => {
      const histogram = observabilityManager.metrics.histograms.get('validation_duration_seconds');
      
      expect(histogram.values).toHaveLength(0);
      
      histogram.record(1.5, { type: 'test' });
      expect(histogram.values).toHaveLength(1);
      expect(histogram.values[0].value).toBe(1.5);
      
      histogram.record(2.3, { type: 'batch' });
      expect(histogram.values).toHaveLength(2);
    });

    test('should create functional mock gauge', () => {
      const gauge = observabilityManager.metrics.gauges.get('active_validations');
      
      expect(gauge.value).toBe(0);
      
      gauge.record(5, { node: 'worker1' });
      expect(gauge.value).toBe(5);
      
      gauge.record(3, { node: 'worker2' });
      expect(gauge.value).toBe(3);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete validation lifecycle with observability', async () => {
      observabilityManager.configure({ 
        enabled: true,
        serviceName: 'validation-service'
      });
      
      // Simulate validation execution
      const validationType = 'deepeval';
      const startTime = Date.now();
      
      const result = await observabilityManager.withTracing(
        'validation_execution',
        async (span) => {
          span.setAttributes({
            'validation.type': validationType,
            'validation.framework': 'deepeval'
          });
          
          // Update active validations
          observabilityManager.updateActiveValidations(1);
          
          // Simulate work
          await new Promise(resolve => setTimeout(resolve, 100));
          
          span.addEvent('validation_completed', {
            'validation.score': 0.85
          });
          
          return { score: 0.85, status: 'success' };
        },
        { 'operation.category': 'validation' }
      );
      
      const duration = (Date.now() - startTime) / 1000;
      
      // Record metrics
      observabilityManager.recordValidationExecution(
        validationType,
        result.status,
        duration,
        result.score
      );
      
      // Update active validations
      observabilityManager.updateActiveValidations(0);
      
      // Verify metrics were recorded
      const executionsCounter = observabilityManager.metrics.counters.get('validation_executions_total');
      const durationHistogram = observabilityManager.metrics.histograms.get('validation_duration_seconds');
      const scoreHistogram = observabilityManager.metrics.histograms.get('validation_score');
      const activeGauge = observabilityManager.metrics.gauges.get('active_validations');
      
      expect(executionsCounter.value).toBe(1);
      expect(durationHistogram.values).toHaveLength(1);
      expect(scoreHistogram.values).toHaveLength(1);
      expect(scoreHistogram.values[0].value).toBe(0.85);
      expect(activeGauge.value).toBe(0);
    });
  });
});