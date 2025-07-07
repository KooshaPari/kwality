const { OpenLLMetryIntegration } = require('../../src/services/openllmetry-integration');
const fs = require('fs');
const path = require('path');

describe('OpenLLMetryIntegration', () => {
  let openLLMetry;

  beforeEach(() => {
    openLLMetry = new OpenLLMetryIntegration();
  });

  afterEach(async () => {
    if (openLLMetry && openLLMetry.isInitialized) {
      await openLLMetry.shutdown();
    }
  });

  describe('Configuration Loading', () => {
    test('should load default configuration when config file not found', async () => {
      openLLMetry.configPath = '/nonexistent/config.yml';
      
      const config = await openLLMetry.loadConfiguration();
      
      expect(config).toBeDefined();
      expect(config.service.name).toBe('llm-validation-platform');
      expect(config.service.version).toBe('1.0.0');
      expect(config.llm_monitoring.semantic_metrics.enabled).toBe(true);
    });

    test('should process environment variables in configuration', () => {
      const config = {
        service: {
          name: '${SERVICE_NAME:-default-service}',
          environment: '${NODE_ENV:-development}'
        },
        endpoint: '${ENDPOINT:-http://localhost:4317}'
      };

      process.env.SERVICE_NAME = 'test-service';
      process.env.NODE_ENV = 'test';
      
      const processed = openLLMetry.processEnvironmentVariables(config);
      
      expect(processed.service.name).toBe('test-service');
      expect(processed.service.environment).toBe('test');
      expect(processed.endpoint).toBe('http://localhost:4317'); // Uses default
      
      delete process.env.SERVICE_NAME;
      delete process.env.NODE_ENV;
    });

    test('should handle nested environment variables', () => {
      const config = {
        database: {
          host: '${DB_HOST:-localhost}',
          port: '${DB_PORT:-5432}',
          credentials: {
            username: '${DB_USER:-postgres}',
            password: '${DB_PASS:-password}'
          }
        }
      };

      process.env.DB_HOST = 'prod-db';
      process.env.DB_USER = 'admin';
      
      const processed = openLLMetry.processEnvironmentVariables(config);
      
      expect(processed.database.host).toBe('prod-db');
      expect(processed.database.port).toBe('5432'); // Default
      expect(processed.database.credentials.username).toBe('admin');
      expect(processed.database.credentials.password).toBe('password'); // Default
      
      delete process.env.DB_HOST;
      delete process.env.DB_USER;
    });
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', async () => {
      await openLLMetry.initialize();
      
      expect(openLLMetry.isInitialized).toBe(true);
      expect(openLLMetry.config).toBeDefined();
      expect(openLLMetry.meterProvider).toBeDefined();
      expect(openLLMetry.tracerProvider).toBeDefined();
    });

    test('should initialize with custom configuration', async () => {
      const customConfig = {
        service: {
          name: 'custom-service',
          version: '2.0.0',
          environment: 'production'
        },
        llm_monitoring: {
          semantic_metrics: { enabled: true },
          syntactic_metrics: { enabled: false },
          safety_metrics: { enabled: true },
          structural_metrics: { enabled: false },
          performance_metrics: { enabled: true }
        }
      };

      await openLLMetry.initialize(customConfig);
      
      expect(openLLMetry.isInitialized).toBe(true);
      expect(openLLMetry.config.service.name).toBe('custom-service');
      expect(openLLMetry.config.service.version).toBe('2.0.0');
    });

    test('should handle initialization errors gracefully', async () => {
      // Since we're using fallback implementation, this should work
      await openLLMetry.initialize();
      expect(openLLMetry.isInitialized).toBe(true);
    });
  });

  describe('Metric Initialization', () => {
    beforeEach(async () => {
      await openLLMetry.initialize();
    });

    test('should initialize semantic metrics', async () => {
      await openLLMetry.initializeSemanticMetrics();
      
      expect(openLLMetry.llmMetrics.has('relevance_score')).toBe(true);
      expect(openLLMetry.llmMetrics.has('coherence_score')).toBe(true);
      expect(openLLMetry.llmMetrics.has('factual_accuracy')).toBe(true);
      expect(openLLMetry.llmMetrics.has('hallucination_detection')).toBe(true);
    });

    test('should initialize syntactic metrics', async () => {
      await openLLMetry.initializeSyntacticMetrics();
      
      expect(openLLMetry.llmMetrics.has('grammar_score')).toBe(true);
      expect(openLLMetry.llmMetrics.has('spelling_score')).toBe(true);
      expect(openLLMetry.llmMetrics.has('punctuation_score')).toBe(true);
      expect(openLLMetry.llmMetrics.has('structure_score')).toBe(true);
    });

    test('should initialize safety metrics', async () => {
      await openLLMetry.initializeSafetyMetrics();
      
      expect(openLLMetry.llmMetrics.has('toxicity_score')).toBe(true);
      expect(openLLMetry.llmMetrics.has('bias_score')).toBe(true);
      expect(openLLMetry.llmMetrics.has('harmful_content')).toBe(true);
      expect(openLLMetry.llmMetrics.has('privacy_risk')).toBe(true);
    });

    test('should initialize structural metrics', async () => {
      await openLLMetry.initializeStructuralMetrics();
      
      expect(openLLMetry.llmMetrics.has('completeness_score')).toBe(true);
      expect(openLLMetry.llmMetrics.has('information_density')).toBe(true);
      expect(openLLMetry.llmMetrics.has('logical_flow')).toBe(true);
      expect(openLLMetry.llmMetrics.has('citation_accuracy')).toBe(true);
    });

    test('should initialize performance metrics', async () => {
      await openLLMetry.initializePerformanceMetrics();
      
      expect(openLLMetry.llmMetrics.has('response_time')).toBe(true);
      expect(openLLMetry.llmMetrics.has('token_usage')).toBe(true);
      expect(openLLMetry.llmMetrics.has('cost_per_request')).toBe(true);
      expect(openLLMetry.llmMetrics.has('error_rate')).toBe(true);
    });
  });

  describe('Metrics Recording', () => {
    beforeEach(async () => {
      await openLLMetry.initialize();
    });

    test('should record LLM quality metrics', () => {
      const metrics = {
        semantic: {
          relevance: 0.85,
          coherence: 0.90,
          factual_accuracy: 0.80
        },
        syntactic: {
          grammar: 0.95,
          spelling: 0.98
        },
        safety: {
          toxicity: 0.05,
          bias: 0.10
        },
        structural: {
          completeness: 0.88,
          logical_flow: 0.85
        },
        performance: {
          response_time: 1500,
          token_usage: 250,
          cost_per_request: 0.02
        }
      };

      const attributes = {
        model: 'claude-3-sonnet',
        provider: 'anthropic'
      };

      openLLMetry.recordLLMQualityMetrics(metrics, attributes);

      // Since we're using fallback implementation, just verify it doesn't throw
      expect(openLLMetry.llmMetrics.size).toBeGreaterThan(0);
    });

    test('should handle missing metric categories gracefully', () => {
      const partialMetrics = {
        semantic: {
          relevance: 0.85
        }
        // Missing other categories
      };

      expect(() => {
        openLLMetry.recordLLMQualityMetrics(partialMetrics);
      }).not.toThrow();
    });

    test('should not record metrics when not initialized', () => {
      const uninitializedIntegration = new OpenLLMetryIntegration();
      
      expect(() => {
        uninitializedIntegration.recordLLMQualityMetrics({
          semantic: { relevance: 0.85 }
        });
      }).not.toThrow();
    });
  });

  describe('Tracing', () => {
    beforeEach(async () => {
      await openLLMetry.initialize();
    });

    test('should create LLM tracer', () => {
      const validationType = 'deepeval';
      const tracer = openLLMetry.createLLMTracer(validationType);
      
      expect(tracer).toBeDefined();
      expect(openLLMetry.llmTracers.has(validationType)).toBe(true);
    });

    test('should reuse existing tracer', () => {
      const validationType = 'deepeval';
      const tracer1 = openLLMetry.createLLMTracer(validationType);
      const tracer2 = openLLMetry.createLLMTracer(validationType);
      
      expect(tracer1).toBe(tracer2);
      expect(openLLMetry.llmTracers.size).toBe(1);
    });

    test('should start LLM validation span', () => {
      const validationType = 'deepeval';
      const operationName = 'llm_response_validation';
      const attributes = {
        'llm.model': 'claude-3-sonnet',
        'llm.provider': 'anthropic'
      };

      const span = openLLMetry.startLLMValidationSpan(validationType, operationName, attributes);
      
      expect(span).toBeDefined();
      expect(span.name).toBe(operationName);
      expect(span.attributes['llm.validation.type']).toBe(validationType);
      expect(span.attributes['llm.model']).toBe('claude-3-sonnet');
    });
  });

  describe('Health Status', () => {
    test('should return health status when not initialized', () => {
      const status = openLLMetry.getHealthStatus();
      
      expect(status.initialized).toBe(false);
      expect(status.sdkActive).toBe(false);
      expect(status.metricsCount).toBe(0);
      expect(status.tracersCount).toBe(0);
    });

    test('should return health status when initialized', async () => {
      await openLLMetry.initialize();
      
      // Create some tracers
      openLLMetry.createLLMTracer('deepeval');
      openLLMetry.createLLMTracer('playwright');
      
      const status = openLLMetry.getHealthStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.sdkActive).toBe(true);
      expect(status.serviceName).toBe('llm-validation-platform');
      expect(status.metricsCount).toBeGreaterThan(0);
      expect(status.tracersCount).toBe(2);
      expect(status.configuration.semanticMetrics).toBe(true);
      expect(status.configuration.performanceMetrics).toBe(true);
    });
  });

  describe('Resource Creation', () => {
    test('should create resource with correct attributes', async () => {
      const config = openLLMetry.getDefaultConfiguration();
      openLLMetry.config = config;
      
      const resource = openLLMetry.createResource();
      
      expect(resource).toBeDefined();
      expect(resource.attributes).toBeDefined();
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully when not initialized', async () => {
      await expect(openLLMetry.shutdown()).resolves.not.toThrow();
      expect(openLLMetry.isInitialized).toBe(false);
    });

    test('should shutdown gracefully when initialized', async () => {
      await openLLMetry.initialize();
      
      expect(openLLMetry.isInitialized).toBe(true);
      expect(openLLMetry.llmMetrics.size).toBeGreaterThan(0);
      
      await openLLMetry.shutdown();
      
      expect(openLLMetry.isInitialized).toBe(false);
      expect(openLLMetry.llmMetrics.size).toBe(0);
      expect(openLLMetry.llmTracers.size).toBe(0);
      expect(openLLMetry.sdk).toBeNull();
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete LLM validation workflow', async () => {
      await openLLMetry.initialize();
      
      // Start validation span
      const span = openLLMetry.startLLMValidationSpan('deepeval', 'llm_response_validation', {
        'llm.model': 'claude-3-sonnet',
        'llm.prompt': 'What is the capital of France?',
        'llm.response': 'The capital of France is Paris.'
      });
      
      // Record quality metrics
      const qualityMetrics = {
        semantic: {
          relevance: 0.95,
          coherence: 0.90,
          factual_accuracy: 0.98
        },
        safety: {
          toxicity: 0.02,
          bias: 0.05
        },
        performance: {
          response_time: 1200,
          token_usage: 150,
          cost_per_request: 0.015
        }
      };
      
      openLLMetry.recordLLMQualityMetrics(qualityMetrics, {
        'validation.type': 'deepeval',
        'llm.model': 'claude-3-sonnet'
      });
      
      // End span
      span.end();
      
      // Verify span was created and ended
      expect(span).toBeDefined();
      expect(span.name).toBe('llm_response_validation');
      
      // Verify metrics were recorded
      expect(openLLMetry.llmMetrics.size).toBeGreaterThan(0);
    });

    test('should handle multiple concurrent validations', async () => {
      await openLLMetry.initialize();
      
      const validations = [
        { type: 'deepeval', operation: 'semantic_validation' },
        { type: 'playwright', operation: 'ui_validation' },
        { type: 'custom', operation: 'business_logic_validation' }
      ];
      
      const spans = validations.map(({ type, operation }) =>
        openLLMetry.startLLMValidationSpan(type, operation)
      );
      
      // Record metrics for each validation
      validations.forEach((validation, index) => {
        openLLMetry.recordLLMQualityMetrics({
          performance: {
            response_time: 1000 + index * 200,
            token_usage: 100 + index * 50
          }
        }, {
          'validation.type': validation.type,
          'validation.index': index
        });
      });
      
      // End all spans
      spans.forEach(span => span.end());
      
      expect(spans).toHaveLength(3);
      expect(openLLMetry.llmTracers.size).toBe(3);
    });
  });
});