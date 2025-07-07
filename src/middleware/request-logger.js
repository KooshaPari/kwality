const logger = require('../utils/logger');
const { recordHttpRequest } = require('../utils/metrics');
const { v4: uuidv4 } = require('uuid');

// Request logging middleware
const requestLogger = (req, res, next) => {
  const startTime = Date.now();
  const requestId = uuidv4();
  
  // Add request ID to request object
  req.id = requestId;
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Log request start
  logger.info('Request Started', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    userId: req.user?.id || null,
    timestamp: new Date().toISOString(),
  });
  
  // Override res.end to log response
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Log request completion
    logger.logRequest(req, res, duration);
    
    // Record metrics
    recordHttpRequest(
      req.method,
      req.route?.path || req.path,
      res.statusCode,
      duration / 1000, // Convert to seconds
      req.user?.id || null
    );
    
    // Log additional details for slow requests
    if (duration > 1000) {
      logger.warn('Slow Request', {
        requestId,
        method: req.method,
        url: req.originalUrl,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        userId: req.user?.id || null,
      });
    }
    
    // Log errors
    if (res.statusCode >= 400) {
      logger.error('Request Error', {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip,
        userId: req.user?.id || null,
        userAgent: req.get('User-Agent'),
      });
    }
    
    // Call original end function
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Enhanced request logging with body sanitization
const enhancedRequestLogger = (options = {}) => {
  const {
    logBody = false,
    sanitizeFields = ['password', 'token', 'secret', 'key'],
    maxBodyLength = 1000,
    logHeaders = false,
    logQuery = true,
  } = options;
  
  return (req, res, next) => {
    const startTime = Date.now();
    const requestId = uuidv4();
    
    req.id = requestId;
    res.setHeader('X-Request-ID', requestId);
    
    // Sanitize sensitive data
    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      
      const sanitized = { ...obj };
      sanitizeFields.forEach(field => {
        if (sanitized[field]) {
          sanitized[field] = '[REDACTED]';
        }
      });
      
      return sanitized;
    };
    
    // Prepare request log data
    const requestLogData = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      referer: req.get('Referer'),
      contentType: req.get('Content-Type'),
      contentLength: req.get('Content-Length'),
      userId: req.user?.id || null,
      timestamp: new Date().toISOString(),
    };
    
    // Add query parameters
    if (logQuery && Object.keys(req.query).length > 0) {
      requestLogData.query = sanitizeObject(req.query);
    }
    
    // Add request headers
    if (logHeaders) {
      requestLogData.headers = sanitizeObject(req.headers);
    }
    
    // Add request body
    if (logBody && req.body && Object.keys(req.body).length > 0) {
      let body = sanitizeObject(req.body);
      
      // Truncate large bodies
      const bodyString = JSON.stringify(body);
      if (bodyString.length > maxBodyLength) {
        body = bodyString.substring(0, maxBodyLength) + '...[TRUNCATED]';
      }
      
      requestLogData.body = body;
    }
    
    logger.info('Request Started', requestLogData);
    
    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function(chunk, encoding) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      const responseLogData = {
        requestId,
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        userId: req.user?.id || null,
        responseSize: res.get('Content-Length') || (chunk ? chunk.length : 0),
        timestamp: new Date().toISOString(),
      };
      
      // Log response based on status code
      if (res.statusCode >= 500) {
        logger.error('Request Completed with Server Error', responseLogData);
      } else if (res.statusCode >= 400) {
        logger.warn('Request Completed with Client Error', responseLogData);
      } else {
        logger.info('Request Completed', responseLogData);
      }
      
      // Record metrics
      recordHttpRequest(
        req.method,
        req.route?.path || req.path,
        res.statusCode,
        duration / 1000,
        req.user?.id || null
      );
      
      return originalEnd.call(this, chunk, encoding);
    };
    
    next();
  };
};

// Security-focused request logger
const securityLogger = (req, res, next) => {
  const requestId = uuidv4();
  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  
  // Log security-relevant information
  const securityData = {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    referer: req.get('Referer'),
    authorization: req.get('Authorization') ? '[PRESENT]' : '[ABSENT]',
    apiKey: req.get('X-API-Key') ? '[PRESENT]' : '[ABSENT]',
    userId: req.user?.id || null,
    timestamp: new Date().toISOString(),
  };
  
  // Log authentication attempts
  if (req.originalUrl.includes('/auth/')) {
    logger.logSecurity('authentication_attempt', req.user?.id || null, securityData);
  }
  
  // Log admin access attempts
  if (req.originalUrl.includes('/admin/')) {
    logger.logSecurity('admin_access_attempt', req.user?.id || null, securityData);
  }
  
  // Log API key usage
  if (req.get('X-API-Key')) {
    logger.logSecurity('api_key_usage', req.user?.id || null, securityData);
  }
  
  next();
};

// Request correlation middleware
const correlationLogger = (req, res, next) => {
  // Check for existing correlation ID
  let correlationId = req.get('X-Correlation-ID') || req.get('X-Request-ID');
  
  if (!correlationId) {
    correlationId = uuidv4();
  }
  
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);
  
  // Add correlation ID to all subsequent logs
  const originalLog = logger.info;
  logger.info = function(message, meta = {}) {
    return originalLog.call(this, message, {
      ...meta,
      correlationId,
    });
  };
  
  next();
};

// Performance monitoring middleware
const performanceLogger = (req, res, next) => {
  const startTime = process.hrtime.bigint();
  const requestId = uuidv4();
  
  req.id = requestId;
  req.startTime = startTime;
  
  // Override res.end to log performance metrics
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const endTime = process.hrtime.bigint();
    const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    
    const performanceData = {
      requestId,
      method: req.method,
      url: req.originalUrl,
      duration: `${duration.toFixed(2)}ms`,
      statusCode: res.statusCode,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date().toISOString(),
    };
    
    logger.logPerformance('http_request', duration, performanceData);
    
    return originalEnd.call(this, chunk, encoding);
  };
  
  next();
};

// Error context logger
const errorContextLogger = (req, res, next) => {
  // Store request context for error logging
  req.errorContext = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null,
    timestamp: new Date().toISOString(),
    headers: {
      'content-type': req.get('Content-Type'),
      'content-length': req.get('Content-Length'),
      'authorization': req.get('Authorization') ? '[PRESENT]' : '[ABSENT]',
    },
  };
  
  next();
};

module.exports = {
  requestLogger,
  enhancedRequestLogger,
  securityLogger,
  correlationLogger,
  performanceLogger,
  errorContextLogger,
};