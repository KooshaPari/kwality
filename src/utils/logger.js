const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = path.join(process.cwd(), 'logs');
require('fs').mkdirSync(logDir, { recursive: true });

// Define custom format
const customFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

// Create transport configurations
const transports = [
  // Console transport
  new winston.transports.Console({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, stack }) => {
        if (stack) {
          return `${timestamp} [${level}]: ${message}\n${stack}`;
        }
        return `${timestamp} [${level}]: ${message}`;
      })
    )
  }),

  // Error log file - daily rotation
  new DailyRotateFile({
    level: 'error',
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: customFormat,
    handleExceptions: true,
    handleRejections: true
  }),

  // Combined log file - daily rotation
  new DailyRotateFile({
    level: 'info',
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d',
    format: customFormat
  }),

  // HTTP access log file - daily rotation
  new DailyRotateFile({
    level: 'http',
    filename: path.join(logDir, 'access-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d',
    format: customFormat
  })
];

// Add debug log file in development
if (process.env.NODE_ENV === 'development') {
  transports.push(
    new DailyRotateFile({
      level: 'debug',
      filename: path.join(logDir, 'debug-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '7d',
      format: customFormat
    })
  );
}

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format: customFormat,
  transports,
  exitOnError: false
});

// Add request logging helper
logger.logRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl,
    status: res.statusCode,
    responseTime: `${responseTime}ms`,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id || null,
    timestamp: new Date().toISOString()
  };

  if (res.statusCode >= 400) {
    logger.error('HTTP Request Error', logData);
  } else if (res.statusCode >= 300) {
    logger.warn('HTTP Request Warning', logData);
  } else {
    logger.http('HTTP Request', logData);
  }
};

// Add database query logging helper
logger.logQuery = (query, params, duration) => {
  const logData = {
    query: query.replace(/\s+/g, ' ').trim(),
    params,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString()
  };

  if (duration > 1000) {
    logger.warn('Slow Database Query', logData);
  } else {
    logger.debug('Database Query', logData);
  }
};

// Add validation logging helper
logger.logValidation = (validationId, status, message, metadata = {}) => {
  const logData = {
    validationId,
    status,
    message,
    metadata,
    timestamp: new Date().toISOString()
  };

  if (status === 'failed' || status === 'error') {
    logger.error('Validation Error', logData);
  } else if (status === 'passed') {
    logger.info('Validation Success', logData);
  } else {
    logger.info('Validation Update', logData);
  }
};

// Add audit logging helper
logger.logAudit = (userId, action, resource, details = {}) => {
  logger.info('Audit Log', {
    userId,
    action,
    resource,
    details,
    timestamp: new Date().toISOString()
  });
};

// Add performance logging helper
logger.logPerformance = (operation, duration, metadata = {}) => {
  const logData = {
    operation,
    duration: `${duration}ms`,
    metadata,
    timestamp: new Date().toISOString()
  };

  if (duration > 5000) {
    logger.error('Performance Issue - Very Slow Operation', logData);
  } else if (duration > 1000) {
    logger.warn('Performance Warning - Slow Operation', logData);
  } else {
    logger.debug('Performance Log', logData);
  }
};

// Add security logging helper
logger.logSecurity = (event, userId, details = {}) => {
  logger.warn('Security Event', {
    event,
    userId,
    details,
    timestamp: new Date().toISOString()
  });
};

// Handle uncaught exceptions and rejections
logger.exceptions.handle(
  new winston.transports.File({ filename: path.join(logDir, 'exceptions.log') })
);

logger.rejections.handle(
  new winston.transports.File({ filename: path.join(logDir, 'rejections.log') })
);

// Export logger with helper methods
module.exports = logger;