const { NodeSDK } = require('@opentelemetry/sdk-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { PrometheusExporter } = require('@opentelemetry/exporter-prometheus');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const { ExpressInstrumentation } = require('@opentelemetry/instrumentation-express');
const { PgInstrumentation } = require('@opentelemetry/instrumentation-pg');
const { RedisInstrumentation } = require('@opentelemetry/instrumentation-redis');
const { trace, context, SpanStatusCode } = require('@opentelemetry/api');

// Service information
const serviceName = 'llm-validation-platform';
const serviceVersion = process.env.npm_package_version || '1.0.0';
const environment = process.env.NODE_ENV || 'development';

// Initialize OpenTelemetry SDK
let sdk;
let tracer;

const initializeTelemetry = () => {
  // Create resource
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceVersion,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: 'llm-validation',
  });

  // Create Prometheus exporter
  const prometheusExporter = new PrometheusExporter({
    port: process.env.PROMETHEUS_PORT || 9090,
  });

  // Create SDK
  sdk = new NodeSDK({
    resource,
    instrumentations: [
      new HttpInstrumentation({
        requestHook: (span, request) => {
          span.setAttributes({
            'http.request.size': request.headers['content-length'] || 0,
            'http.user_agent': request.headers['user-agent'] || '',
          });
        },
        responseHook: (span, response) => {
          span.setAttributes({
            'http.response.size': response.headers['content-length'] || 0,
          });
        },
      }),
      new ExpressInstrumentation({
        requestHook: (span, info) => {
          span.setAttributes({
            'express.route': info.route || '',
            'express.method': info.request.method || '',
          });
        },
      }),
      new PgInstrumentation({
        requestHook: (span, queryConfig) => {
          span.setAttributes({
            'db.postgresql.query': queryConfig.text || '',
            'db.postgresql.values': JSON.stringify(queryConfig.values || []),
          });
        },
      }),
      new RedisInstrumentation({
        requestHook: (span, cmdName, cmdArgs) => {
          span.setAttributes({
            'redis.command': cmdName,
            'redis.args': JSON.stringify(cmdArgs),
          });
        },
      }),
    ],
  });

  // Initialize the SDK
  sdk.start();

  // Get tracer
  tracer = trace.getTracer(serviceName, serviceVersion);

  console.log(`✓ OpenTelemetry initialized for ${serviceName}@${serviceVersion}`);
};

// Custom span creation helpers
const createSpan = (name, attributes = {}) => {
  return tracer.startSpan(name, {
    attributes: {
      'service.name': serviceName,
      'service.version': serviceVersion,
      ...attributes,
    },
  });
};

const createChildSpan = (name, parentSpan, attributes = {}) => {
  return tracer.startSpan(name, {
    parent: parentSpan,
    attributes: {
      'service.name': serviceName,
      'service.version': serviceVersion,
      ...attributes,
    },
  });
};

// Database operation tracing
const traceDbOperation = async (operation, table, callback) => {
  const span = createSpan('db.operation', {
    'db.operation': operation,
    'db.table': table,
    'db.system': 'postgresql',
  });

  try {
    const result = await callback();
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
};

// Validation execution tracing
const traceValidationExecution = async (validationId, validationType, callback) => {
  const span = createSpan('validation.execution', {
    'validation.id': validationId,
    'validation.type': validationType,
    'validation.service': serviceName,
  });

  try {
    const result = await callback();
    span.setAttributes({
      'validation.result.status': result.status,
      'validation.result.score': result.score || 0,
      'validation.result.duration': result.duration || 0,
    });
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    span.setAttributes({
      'validation.result.status': 'error',
      'validation.error.type': error.constructor.name,
    });
    throw error;
  } finally {
    span.end();
  }
};

// Agent task tracing
const traceAgentTask = async (agentId, agentType, taskType, callback) => {
  const span = createSpan('agent.task', {
    'agent.id': agentId,
    'agent.type': agentType,
    'agent.task.type': taskType,
  });

  try {
    const result = await callback();
    span.setAttributes({
      'agent.task.result': result.success ? 'success' : 'failure',
      'agent.task.duration': result.duration || 0,
    });
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
};

// Cache operation tracing
const traceCacheOperation = async (operation, key, callback) => {
  const span = createSpan('cache.operation', {
    'cache.operation': operation,
    'cache.key': key,
    'cache.system': 'redis',
  });

  try {
    const result = await callback();
    span.setAttributes({
      'cache.hit': result.hit || false,
      'cache.key.exists': result.exists || false,
    });
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
};

// HTTP request tracing middleware
const traceHttpRequest = (req, res, next) => {
  const span = createSpan('http.request', {
    'http.method': req.method,
    'http.url': req.url,
    'http.route': req.route?.path || req.path,
    'http.user_agent': req.get('User-Agent') || '',
    'http.remote_addr': req.ip || req.connection.remoteAddress || '',
    'user.id': req.user?.id || null,
  });

  // Add span to request context
  req.span = span;

  // Override res.end to capture response data
  const originalEnd = res.end;
  res.end = function(...args) {
    span.setAttributes({
      'http.status_code': res.statusCode,
      'http.response.size': res.get('Content-Length') || 0,
    });

    if (res.statusCode >= 400) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: `HTTP ${res.statusCode}`,
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    span.end();
    return originalEnd.apply(this, args);
  };

  next();
};

// Custom event recording
const recordEvent = (name, attributes = {}) => {
  const span = createSpan('custom.event', {
    'event.name': name,
    'event.timestamp': new Date().toISOString(),
    ...attributes,
  });
  
  span.addEvent(name, attributes);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
};

// Performance monitoring
const measurePerformance = async (operationName, callback, attributes = {}) => {
  const startTime = Date.now();
  const span = createSpan('performance.measure', {
    'operation.name': operationName,
    'operation.start_time': startTime,
    ...attributes,
  });

  try {
    const result = await callback();
    const endTime = Date.now();
    const duration = endTime - startTime;

    span.setAttributes({
      'operation.duration': duration,
      'operation.end_time': endTime,
      'operation.success': true,
    });

    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;

    span.setAttributes({
      'operation.duration': duration,
      'operation.end_time': endTime,
      'operation.success': false,
      'operation.error': error.message,
    });

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
};

// Error tracking
const trackError = (error, context = {}) => {
  const span = createSpan('error.occurrence', {
    'error.type': error.constructor.name,
    'error.message': error.message,
    'error.stack': error.stack,
    ...context,
  });

  span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
  span.end();
};

// Business metrics tracking
const trackBusinessMetric = (metricName, value, attributes = {}) => {
  const span = createSpan('business.metric', {
    'metric.name': metricName,
    'metric.value': value,
    'metric.timestamp': new Date().toISOString(),
    ...attributes,
  });

  span.addEvent('business_metric_recorded', {
    metricName,
    value,
    ...attributes,
  });

  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
};

// Health check tracing
const traceHealthCheck = async (component, callback) => {
  const span = createSpan('health.check', {
    'health.component': component,
  });

  try {
    const result = await callback();
    span.setAttributes({
      'health.status': result.status,
      'health.response_time': result.responseTime || 0,
    });
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    span.recordException(error);
    throw error;
  } finally {
    span.end();
  }
};

// Graceful shutdown
const shutdown = async () => {
  if (sdk) {
    await sdk.shutdown();
    console.log('OpenTelemetry SDK shut down successfully');
  }
};

// Handle process termination
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = {
  initializeTelemetry,
  shutdown,
  tracer,
  createSpan,
  createChildSpan,
  traceDbOperation,
  traceValidationExecution,
  traceAgentTask,
  traceCacheOperation,
  traceHttpRequest,
  recordEvent,
  measurePerformance,
  trackError,
  trackBusinessMetric,
  traceHealthCheck,
};