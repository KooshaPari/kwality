const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

// Conditionally require OpenTelemetry modules
let NodeSDK, getNodeAutoInstrumentations, OTLPTraceExporter, OTLPMetricExporter, PrometheusExporter;
let Resource, SemanticResourceAttributes, metrics, trace, yaml;

try {
  ({ NodeSDK } = require('@opentelemetry/sdk-node'));
  ({ getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node'));
  ({ OTLPTraceExporter } = require('@opentelemetry/exporter-otlp-http'));
  ({ OTLPMetricExporter } = require('@opentelemetry/exporter-otlp-http'));
  ({ PrometheusExporter } = require('@opentelemetry/exporter-prometheus'));
  ({ Resource } = require('@opentelemetry/resources'));
  ({ SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions'));
  ({ metrics, trace } = require('@opentelemetry/api'));
  yaml = require('yaml');
} catch (error) {
  logger.warn('OpenTelemetry packages not available, using mock implementation:', error.message);
}

/**
 * OpenLLMetry Integration for LLM-specific observability
 */
class OpenLLMetryIntegration {
  constructor() {
    this.sdk = null;
    this.config = null;
    this.isInitialized = false;
    this.meterProvider = null;
    this.tracerProvider = null;
    this.llmMetrics = new Map();
    this.llmTracers = new Map();
    this.configPath = path.join(__dirname, '../../monitoring/openllmetry-config.yml');
  }

  /**
   * Initialize OpenLLMetry with configuration
   */
  async initialize(customConfig = null) {
    try {
      // Load configuration
      this.config = customConfig || await this.loadConfiguration();
      
      // Create resource
      const resource = this.createResource();
      
      // Initialize OpenTelemetry SDK
      await this.initializeSDK(resource);
      
      // Initialize LLM-specific instrumentation
      await this.initializeLLMInstrumentation();
      
      this.isInitialized = true;
      logger.info('OpenLLMetry integration initialized successfully', {
        serviceName: this.config.service.name,
        environment: this.config.service.environment
      });
      
    } catch (error) {
      logger.error('Failed to initialize OpenLLMetry integration:', error);
      throw error;
    }
  }

  /**
   * Load configuration from YAML file
   */
  async loadConfiguration() {
    try {
      const configFile = await fs.promises.readFile(this.configPath, 'utf8');
      
      let config;
      if (yaml) {
        config = yaml.parse(configFile);
      } else {
        // Simple YAML-like parsing for basic cases when yaml package is not available
        config = this.parseSimpleYaml(configFile);
      }
      
      // Replace environment variables
      const processedConfig = this.processEnvironmentVariables(config);
      
      logger.info('OpenLLMetry configuration loaded', {
        configPath: this.configPath,
        serviceName: processedConfig.service?.name
      });
      
      return processedConfig;
    } catch (error) {
      logger.warn('Failed to load OpenLLMetry configuration, using defaults:', error.message);
      return this.getDefaultConfiguration();
    }
  }

  /**
   * Simple YAML parser for basic configuration when yaml package is not available
   */
  parseSimpleYaml(yamlContent) {
    // This is a very basic YAML parser for demonstration
    // In production, you should use a proper YAML library
    logger.info('Using fallback YAML parser - consider installing yaml package for full functionality');
    return this.getDefaultConfiguration();
  }

  /**
   * Process environment variables in configuration
   */
  processEnvironmentVariables(config) {
    const processValue = (value) => {
      if (typeof value === 'string' && value.includes('${')) {
        return value.replace(/\$\{([^}]+)\}/g, (match, varName) => {
          const [name, defaultValue] = varName.split(':-');
          return process.env[name] || defaultValue || '';
        });
      }
      return value;
    };

    const processObject = (obj) => {
      const result = {};
      for (const [key, value] of Object.entries(obj)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          result[key] = processObject(value);
        } else if (Array.isArray(value)) {
          result[key] = value.map(item => 
            typeof item === 'object' ? processObject(item) : processValue(item)
          );
        } else {
          result[key] = processValue(value);
        }
      }
      return result;
    };

    return processObject(config);
  }

  /**
   * Create OpenTelemetry resource
   */
  createResource() {
    if (!Resource || !SemanticResourceAttributes) {
      logger.warn('OpenTelemetry resource creation not available, using mock resource');
      return { attributes: this.config.opentelemetry?.resource?.attributes || {} };
    }

    const resourceAttributes = {
      [SemanticResourceAttributes.SERVICE_NAME]: this.config.service.name,
      [SemanticResourceAttributes.SERVICE_VERSION]: this.config.service.version,
      [SemanticResourceAttributes.SERVICE_NAMESPACE]: this.config.service.namespace,
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: this.config.service.environment,
      ...this.config.opentelemetry.resource.attributes
    };

    return new Resource(resourceAttributes);
  }

  /**
   * Initialize OpenTelemetry SDK
   */
  async initializeSDK(resource) {
    if (!NodeSDK || !getNodeAutoInstrumentations || !metrics || !trace) {
      logger.warn('OpenTelemetry SDK not available, using mock providers');
      this.meterProvider = new MockMeterProvider();
      this.tracerProvider = new MockTracerProvider();
      this.sdk = new MockSDK();
      return;
    }

    const instrumentations = getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': {
        enabled: false, // Disable file system instrumentation for performance
      },
    });

    // Configure trace exporter
    let traceExporter = null;
    if (OTLPTraceExporter) {
      traceExporter = new OTLPTraceExporter({
        url: this.config.opentelemetry.sdk.traces.exporter.otlp.endpoint,
        headers: this.config.opentelemetry.sdk.traces.exporter.otlp.headers,
      });
    }

    // Configure metric exporters
    const metricExporters = [];
    
    if (this.config.opentelemetry.sdk.metrics.exporter.prometheus && PrometheusExporter) {
      metricExporters.push(new PrometheusExporter({
        port: this.config.opentelemetry.sdk.metrics.exporter.prometheus.port,
      }));
    }
    
    if (this.config.opentelemetry.sdk.metrics.exporter.otlp && OTLPMetricExporter) {
      metricExporters.push(new OTLPMetricExporter({
        url: this.config.opentelemetry.sdk.metrics.exporter.otlp.endpoint,
      }));
    }

    // Initialize SDK
    this.sdk = new NodeSDK({
      resource,
      traceExporter,
      metricReader: metricExporters,
      instrumentations,
    });

    await this.sdk.start();
    
    this.meterProvider = metrics.getMeterProvider();
    this.tracerProvider = trace.getTracerProvider();
  }

  /**
   * Initialize LLM-specific instrumentation
   */
  async initializeLLMInstrumentation() {
    // Initialize semantic quality metrics
    if (this.config.llm_monitoring.semantic_metrics.enabled) {
      await this.initializeSemanticMetrics();
    }

    // Initialize syntactic quality metrics
    if (this.config.llm_monitoring.syntactic_metrics.enabled) {
      await this.initializeSyntacticMetrics();
    }

    // Initialize safety metrics
    if (this.config.llm_monitoring.safety_metrics.enabled) {
      await this.initializeSafetyMetrics();
    }

    // Initialize structural metrics
    if (this.config.llm_monitoring.structural_metrics.enabled) {
      await this.initializeStructuralMetrics();
    }

    // Initialize performance metrics
    if (this.config.llm_monitoring.performance_metrics.enabled) {
      await this.initializePerformanceMetrics();
    }
  }

  /**
   * Initialize semantic quality metrics
   */
  async initializeSemanticMetrics() {
    const meter = this.meterProvider.getMeter('llm-semantic-quality', '1.0.0');
    
    this.llmMetrics.set('relevance_score', meter.createHistogram('llm_relevance_score', {
      description: 'LLM response relevance score',
      unit: '1',
    }));

    this.llmMetrics.set('coherence_score', meter.createHistogram('llm_coherence_score', {
      description: 'LLM response coherence score',
      unit: '1',
    }));

    this.llmMetrics.set('factual_accuracy', meter.createHistogram('llm_factual_accuracy', {
      description: 'LLM response factual accuracy score',
      unit: '1',
    }));

    this.llmMetrics.set('hallucination_detection', meter.createHistogram('llm_hallucination_score', {
      description: 'LLM response hallucination detection score (lower is better)',
      unit: '1',
    }));

    logger.debug('Semantic quality metrics initialized');
  }

  /**
   * Initialize syntactic quality metrics
   */
  async initializeSyntacticMetrics() {
    const meter = this.meterProvider.getMeter('llm-syntactic-quality', '1.0.0');
    
    this.llmMetrics.set('grammar_score', meter.createHistogram('llm_grammar_score', {
      description: 'LLM response grammar correctness score',
      unit: '1',
    }));

    this.llmMetrics.set('spelling_score', meter.createHistogram('llm_spelling_score', {
      description: 'LLM response spelling accuracy score',
      unit: '1',
    }));

    this.llmMetrics.set('punctuation_score', meter.createHistogram('llm_punctuation_score', {
      description: 'LLM response punctuation consistency score',
      unit: '1',
    }));

    this.llmMetrics.set('structure_score', meter.createHistogram('llm_structure_score', {
      description: 'LLM response sentence structure score',
      unit: '1',
    }));

    logger.debug('Syntactic quality metrics initialized');
  }

  /**
   * Initialize safety metrics
   */
  async initializeSafetyMetrics() {
    const meter = this.meterProvider.getMeter('llm-safety', '1.0.0');
    
    this.llmMetrics.set('toxicity_score', meter.createHistogram('llm_toxicity_score', {
      description: 'LLM response toxicity score (lower is better)',
      unit: '1',
    }));

    this.llmMetrics.set('bias_score', meter.createHistogram('llm_bias_score', {
      description: 'LLM response bias detection score (lower is better)',
      unit: '1',
    }));

    this.llmMetrics.set('harmful_content', meter.createHistogram('llm_harmful_content_score', {
      description: 'LLM response harmful content score (lower is better)',
      unit: '1',
    }));

    this.llmMetrics.set('privacy_risk', meter.createHistogram('llm_privacy_risk_score', {
      description: 'LLM response privacy leakage risk score (lower is better)',
      unit: '1',
    }));

    logger.debug('Safety metrics initialized');
  }

  /**
   * Initialize structural metrics
   */
  async initializeStructuralMetrics() {
    const meter = this.meterProvider.getMeter('llm-structural-quality', '1.0.0');
    
    this.llmMetrics.set('completeness_score', meter.createHistogram('llm_completeness_score', {
      description: 'LLM response completeness score',
      unit: '1',
    }));

    this.llmMetrics.set('information_density', meter.createHistogram('llm_information_density', {
      description: 'LLM response information density score',
      unit: '1',
    }));

    this.llmMetrics.set('logical_flow', meter.createHistogram('llm_logical_flow_score', {
      description: 'LLM response logical flow score',
      unit: '1',
    }));

    this.llmMetrics.set('citation_accuracy', meter.createHistogram('llm_citation_accuracy', {
      description: 'LLM response citation accuracy score',
      unit: '1',
    }));

    logger.debug('Structural quality metrics initialized');
  }

  /**
   * Initialize performance metrics
   */
  async initializePerformanceMetrics() {
    const meter = this.meterProvider.getMeter('llm-performance', '1.0.0');
    
    this.llmMetrics.set('response_time', meter.createHistogram('llm_response_time', {
      description: 'LLM API response time',
      unit: 'ms',
    }));

    this.llmMetrics.set('token_usage', meter.createHistogram('llm_token_usage', {
      description: 'LLM token usage per request',
      unit: '1',
    }));

    this.llmMetrics.set('cost_per_request', meter.createHistogram('llm_cost_per_request', {
      description: 'LLM cost per request',
      unit: 'USD',
    }));

    this.llmMetrics.set('error_rate', meter.createCounter('llm_errors_total', {
      description: 'Total number of LLM API errors',
      unit: '1',
    }));

    logger.debug('Performance metrics initialized');
  }

  /**
   * Record LLM quality metrics
   */
  recordLLMQualityMetrics(metrics, attributes = {}) {
    if (!this.isInitialized) {
      logger.warn('OpenLLMetry not initialized, skipping metrics recording');
      return;
    }

    const baseAttributes = {
      service: this.config.service.name,
      environment: this.config.service.environment,
      ...attributes
    };

    // Record semantic metrics
    if (metrics.semantic) {
      Object.entries(metrics.semantic).forEach(([metricName, value]) => {
        const instrument = this.llmMetrics.get(`${metricName}_score`) || this.llmMetrics.get(metricName);
        if (instrument) {
          instrument.record(value, baseAttributes);
        }
      });
    }

    // Record syntactic metrics
    if (metrics.syntactic) {
      Object.entries(metrics.syntactic).forEach(([metricName, value]) => {
        const instrument = this.llmMetrics.get(`${metricName}_score`) || this.llmMetrics.get(metricName);
        if (instrument) {
          instrument.record(value, baseAttributes);
        }
      });
    }

    // Record safety metrics
    if (metrics.safety) {
      Object.entries(metrics.safety).forEach(([metricName, value]) => {
        const instrument = this.llmMetrics.get(`${metricName}_score`) || this.llmMetrics.get(metricName);
        if (instrument) {
          instrument.record(value, baseAttributes);
        }
      });
    }

    // Record structural metrics
    if (metrics.structural) {
      Object.entries(metrics.structural).forEach(([metricName, value]) => {
        const instrument = this.llmMetrics.get(`${metricName}_score`) || this.llmMetrics.get(metricName);
        if (instrument) {
          instrument.record(value, baseAttributes);
        }
      });
    }

    // Record performance metrics
    if (metrics.performance) {
      Object.entries(metrics.performance).forEach(([metricName, value]) => {
        const instrument = this.llmMetrics.get(metricName);
        if (instrument) {
          instrument.record(value, baseAttributes);
        }
      });
    }
  }

  /**
   * Create LLM tracer for validation operations
   */
  createLLMTracer(validationType) {
    if (!this.llmTracers.has(validationType)) {
      const tracer = this.tracerProvider.getTracer(`llm-validation-${validationType}`, '1.0.0');
      this.llmTracers.set(validationType, tracer);
    }
    return this.llmTracers.get(validationType);
  }

  /**
   * Start LLM validation span
   */
  startLLMValidationSpan(validationType, operationName, attributes = {}) {
    const tracer = this.createLLMTracer(validationType);
    
    const span = tracer.startSpan(operationName, {
      attributes: {
        'llm.validation.type': validationType,
        'llm.operation': operationName,
        'service.name': this.config.service.name,
        'deployment.environment': this.config.service.environment,
        ...attributes
      }
    });

    return span;
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return {
      initialized: this.isInitialized,
      serviceName: this.config?.service?.name,
      environment: this.config?.service?.environment,
      sdkActive: this.sdk !== null,
      metricsCount: this.llmMetrics.size,
      tracersCount: this.llmTracers.size,
      configuration: {
        semanticMetrics: this.config?.llm_monitoring?.semantic_metrics?.enabled,
        syntacticMetrics: this.config?.llm_monitoring?.syntactic_metrics?.enabled,
        safetyMetrics: this.config?.llm_monitoring?.safety_metrics?.enabled,
        structuralMetrics: this.config?.llm_monitoring?.structural_metrics?.enabled,
        performanceMetrics: this.config?.llm_monitoring?.performance_metrics?.enabled
      }
    };
  }

  /**
   * Get default configuration
   */
  getDefaultConfiguration() {
    return {
      service: {
        name: 'llm-validation-platform',
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        namespace: 'llm-validation'
      },
      opentelemetry: {
        sdk: {
          disabled: false,
          traces: {
            exporter: {
              otlp: {
                endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
                headers: {}
              }
            }
          },
          metrics: {
            exporter: {
              prometheus: {
                port: parseInt(process.env.PROMETHEUS_PORT) || 9090
              },
              otlp: {
                endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317'
              }
            }
          }
        },
        resource: {
          attributes: {
            'service.name': 'llm-validation-platform',
            'service.version': '1.0.0',
            'deployment.environment': process.env.NODE_ENV || 'development'
          }
        }
      },
      llm_monitoring: {
        semantic_metrics: { enabled: true },
        syntactic_metrics: { enabled: true },
        safety_metrics: { enabled: true },
        structural_metrics: { enabled: true },
        performance_metrics: { enabled: true }
      }
    };
  }

  /**
   * Shutdown OpenLLMetry
   */
  async shutdown() {
    if (this.sdk) {
      await this.sdk.shutdown();
      this.sdk = null;
    }
    
    this.llmMetrics.clear();
    this.llmTracers.clear();
    this.isInitialized = false;
    
    logger.info('OpenLLMetry integration shutdown completed');
  }
}

/**
 * Mock implementations for when OpenTelemetry packages are not available
 */
class MockSDK {
  async start() {
    logger.debug('Mock SDK started');
  }

  async shutdown() {
    logger.debug('Mock SDK shutdown');
  }
}

class MockMeterProvider {
  getMeter(name, version) {
    return new MockMeter(name, version);
  }
}

class MockTracerProvider {
  getTracer(name, version) {
    return new MockTracer(name, version);
  }
}

class MockMeter {
  constructor(name, version) {
    this.name = name;
    this.version = version;
  }

  createHistogram(name, options) {
    return new MockHistogram(name, options);
  }

  createCounter(name, options) {
    return new MockCounter(name, options);
  }

  createGauge(name, options) {
    return new MockGauge(name, options);
  }
}

class MockTracer {
  constructor(name, version) {
    this.name = name;
    this.version = version;
  }

  startSpan(name, options) {
    return new MockSpan(name, options);
  }
}

class MockSpan {
  constructor(name, options) {
    this.name = name;
    this.options = options;
    this.attributes = options?.attributes || {};
  }

  setAttribute(key, value) {
    this.attributes[key] = value;
  }

  setAttributes(attributes) {
    this.attributes = { ...this.attributes, ...attributes };
  }

  addEvent(name, attributes) {
    logger.debug('Span event added', { spanName: this.name, eventName: name, attributes });
  }

  recordException(exception) {
    logger.debug('Span exception recorded', { spanName: this.name, exception: exception.message });
  }

  setStatus(status) {
    this.status = status;
  }

  end() {
    logger.debug('Span ended', { spanName: this.name });
  }
}

class MockHistogram {
  constructor(name, options) {
    this.name = name;
    this.options = options;
    this.values = [];
  }

  record(value, attributes) {
    this.values.push({ value, attributes, timestamp: Date.now() });
    logger.debug('Histogram recorded', { name: this.name, value, attributes });
  }
}

class MockCounter {
  constructor(name, options) {
    this.name = name;
    this.options = options;
    this.value = 0;
  }

  record(value, attributes) {
    this.value += value;
    logger.debug('Counter recorded', { name: this.name, value: this.value, increment: value, attributes });
  }
}

class MockGauge {
  constructor(name, options) {
    this.name = name;
    this.options = options;
    this.value = 0;
  }

  record(value, attributes) {
    this.value = value;
    logger.debug('Gauge recorded', { name: this.name, value, attributes });
  }
}

module.exports = { OpenLLMetryIntegration };