const logger = require('../utils/logger');
const { trackError } = require('../utils/telemetry');

// Error types and their corresponding HTTP status codes
const ErrorTypes = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_ERROR: 401,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND_ERROR: 404,
  CONFLICT_ERROR: 409,
  RATE_LIMIT_ERROR: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  TIMEOUT_ERROR: 504,
};

// Custom error classes
class ValidationError extends Error {
  constructor(message, field = null, code = 'VALIDATION_FAILED') {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.code = code;
    this.statusCode = ErrorTypes.VALIDATION_ERROR;
  }
}

class AuthenticationError extends Error {
  constructor(message, code = 'AUTHENTICATION_FAILED') {
    super(message);
    this.name = 'AuthenticationError';
    this.code = code;
    this.statusCode = ErrorTypes.AUTHENTICATION_ERROR;
  }
}

class AuthorizationError extends Error {
  constructor(message, code = 'AUTHORIZATION_FAILED') {
    super(message);
    this.name = 'AuthorizationError';
    this.code = code;
    this.statusCode = ErrorTypes.AUTHORIZATION_ERROR;
  }
}

class NotFoundError extends Error {
  constructor(message, resource = null, code = 'RESOURCE_NOT_FOUND') {
    super(message);
    this.name = 'NotFoundError';
    this.resource = resource;
    this.code = code;
    this.statusCode = ErrorTypes.NOT_FOUND_ERROR;
  }
}

class ConflictError extends Error {
  constructor(message, code = 'RESOURCE_CONFLICT') {
    super(message);
    this.name = 'ConflictError';
    this.code = code;
    this.statusCode = ErrorTypes.CONFLICT_ERROR;
  }
}

class RateLimitError extends Error {
  constructor(message, retryAfter = null, code = 'RATE_LIMIT_EXCEEDED') {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
    this.code = code;
    this.statusCode = ErrorTypes.RATE_LIMIT_ERROR;
  }
}

class ServiceUnavailableError extends Error {
  constructor(message, code = 'SERVICE_UNAVAILABLE') {
    super(message);
    this.name = 'ServiceUnavailableError';
    this.code = code;
    this.statusCode = ErrorTypes.SERVICE_UNAVAILABLE;
  }
}

class TimeoutError extends Error {
  constructor(message, code = 'OPERATION_TIMEOUT') {
    super(message);
    this.name = 'TimeoutError';
    this.code = code;
    this.statusCode = ErrorTypes.TIMEOUT_ERROR;
  }
}

// Database-specific error handling
const handleDatabaseError = (error) => {
  // PostgreSQL error codes
  switch (error.code) {
    case '23505': // unique_violation
      return new ConflictError('Resource already exists', 'DUPLICATE_RESOURCE');
    case '23503': // foreign_key_violation
      return new ValidationError('Referenced resource does not exist', null, 'INVALID_REFERENCE');
    case '23502': // not_null_violation
      return new ValidationError('Required field is missing', error.column, 'MISSING_REQUIRED_FIELD');
    case '23514': // check_violation
      return new ValidationError('Data validation failed', error.column, 'CONSTRAINT_VIOLATION');
    case '42P01': // undefined_table
      return new Error('Database schema error');
    case '42703': // undefined_column
      return new Error('Database schema error');
    case '08003': // connection_does_not_exist
    case '08006': // connection_failure
      return new ServiceUnavailableError('Database connection failed');
    case '57014': // query_canceled
      return new TimeoutError('Database query timeout');
    default:
      return new Error(`Database error: ${error.message}`);
  }
};

// JWT error handling
const handleJWTError = (error) => {
  switch (error.name) {
    case 'TokenExpiredError':
      return new AuthenticationError('Access token has expired', 'TOKEN_EXPIRED');
    case 'JsonWebTokenError':
      return new AuthenticationError('Invalid access token', 'INVALID_TOKEN');
    case 'NotBeforeError':
      return new AuthenticationError('Token not active yet', 'TOKEN_NOT_ACTIVE');
    default:
      return new AuthenticationError('Authentication failed', 'AUTH_ERROR');
  }
};

// Validation error handling (Joi, express-validator, etc.)
const handleValidationError = (error) => {
  if (error.details && error.details.length > 0) {
    // Joi validation error
    const detail = error.details[0];
    return new ValidationError(
      detail.message,
      detail.path ? detail.path.join('.') : null,
      'VALIDATION_FAILED'
    );
  } else if (error.errors && Array.isArray(error.errors)) {
    // Express-validator error
    const firstError = error.errors[0];
    return new ValidationError(
      firstError.msg,
      firstError.param,
      'VALIDATION_FAILED'
    );
  }
  
  return new ValidationError(error.message || 'Validation failed');
};

// Error response formatter
const formatErrorResponse = (error, req) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const baseResponse = {
    error: error.name || 'Error',
    message: error.message || 'An error occurred',
    code: error.code || 'UNKNOWN_ERROR',
    timestamp: new Date().toISOString(),
    requestId: req.id || req.headers['x-request-id'] || 'unknown',
  };

  // Add additional fields for specific error types
  if (error.field) {
    baseResponse.field = error.field;
  }
  
  if (error.resource) {
    baseResponse.resource = error.resource;
  }
  
  if (error.retryAfter) {
    baseResponse.retryAfter = error.retryAfter;
  }

  // Add stack trace in development
  if (isDevelopment && error.stack) {
    baseResponse.stack = error.stack.split('\n');
  }

  return baseResponse;
};

// Main error handler middleware
const errorHandler = (err, req, res, next) => {
  let processedError = err;

  // Handle different error types
  if (err.code && typeof err.code === 'string' && err.code.startsWith('23')) {
    // PostgreSQL error
    processedError = handleDatabaseError(err);
  } else if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
    // JWT error
    processedError = handleJWTError(err);
  } else if (err.name === 'ValidationError' && err.details) {
    // Joi validation error
    processedError = handleValidationError(err);
  } else if (err.errors && Array.isArray(err.errors)) {
    // Express-validator error
    processedError = handleValidationError(err);
  } else if (err.type === 'entity.parse.failed') {
    // JSON parsing error
    processedError = new ValidationError('Invalid JSON in request body', null, 'INVALID_JSON');
  } else if (err.type === 'entity.too.large') {
    // Payload too large
    processedError = new ValidationError('Request payload too large', null, 'PAYLOAD_TOO_LARGE');
  } else if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    // Connection errors
    processedError = new ServiceUnavailableError('External service unavailable');
  } else if (err.code === 'ETIMEDOUT') {
    // Timeout errors
    processedError = new TimeoutError('Operation timed out');
  }

  // Determine status code
  const statusCode = processedError.statusCode || 500;

  // Log error
  const errorContext = {
    error: processedError.name,
    message: processedError.message,
    code: processedError.code,
    statusCode,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null,
    requestId: req.id || req.headers['x-request-id'] || 'unknown',
    stack: processedError.stack,
  };

  if (statusCode >= 500) {
    logger.error('Server Error:', errorContext);
  } else if (statusCode >= 400) {
    logger.warn('Client Error:', errorContext);
  }

  // Track error in telemetry
  trackError(processedError, {
    'http.method': req.method,
    'http.url': req.originalUrl,
    'http.status_code': statusCode,
    'user.id': req.user?.id || null,
    'error.handled': true,
  });

  // Send error response
  const errorResponse = formatErrorResponse(processedError, req);
  
  // Add rate limit headers if applicable
  if (processedError instanceof RateLimitError && processedError.retryAfter) {
    res.set('Retry-After', processedError.retryAfter);
  }

  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
const notFoundHandler = (req, res) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`, 'route');
  const errorResponse = formatErrorResponse(error, req);
  
  logger.warn('Route Not Found:', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  
  res.status(404).json(errorResponse);
};

// Health check for error handler
const healthCheck = () => {
  return {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    errorTypes: Object.keys(ErrorTypes),
    customErrors: [
      'ValidationError',
      'AuthenticationError',
      'AuthorizationError',
      'NotFoundError',
      'ConflictError',
      'RateLimitError',
      'ServiceUnavailableError',
      'TimeoutError',
    ],
  };
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  healthCheck,
  
  // Custom error classes
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError,
  TimeoutError,
  
  // Error type constants
  ErrorTypes,
  
  // Helper functions
  handleDatabaseError,
  handleJWTError,
  handleValidationError,
  formatErrorResponse,
};