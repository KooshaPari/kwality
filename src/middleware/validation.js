const Joi = require('joi');
const { validationResult } = require('express-validator');
const { ValidationError } = require('./error-handler');

// Joi validation middleware
const validateSchema = (schema, property = 'body') => {
  return (req, res, next) => {
    const data = req[property];
    
    const { error, value } = schema.validate(data, {
      abortEarly: false,
      allowUnknown: false,
      stripUnknown: true,
    });
    
    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));
      
      return next(new ValidationError(
        `Validation failed for ${property}`,
        validationErrors[0].field,
        'VALIDATION_FAILED'
      ));
    }
    
    // Replace the request property with the validated and sanitized value
    req[property] = value;
    next();
  };
};

// Express-validator middleware
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const validationErrors = errors.array().map(error => ({
      field: error.param,
      message: error.msg,
      value: error.value,
      location: error.location,
    }));
    
    return next(new ValidationError(
      'Request validation failed',
      validationErrors[0].field,
      'VALIDATION_FAILED'
    ));
  }
  
  next();
};

// Common validation schemas
const commonSchemas = {
  // UUID validation
  uuid: Joi.string().uuid().required(),
  
  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
  }),
  
  // Date range
  dateRange: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  }),
  
  // Search
  search: Joi.object({
    q: Joi.string().min(1).max(255).optional(),
    fields: Joi.array().items(Joi.string()).optional(),
  }),
};

// User validation schemas
const userSchemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(128).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .message('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    full_name: Joi.string().min(2).max(100).required(),
    role: Joi.string().valid('admin', 'validator', 'grader', 'viewer').default('viewer'),
  }),
  
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    mfa_token: Joi.string().length(6).pattern(/^\d+$/).optional(),
  }),
  
  updateProfile: Joi.object({
    full_name: Joi.string().min(2).max(100).optional(),
    email: Joi.string().email().optional(),
  }),
  
  changePassword: Joi.object({
    current_password: Joi.string().required(),
    new_password: Joi.string().min(8).max(128).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
      .message('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  }),
};

// Project validation schemas
const projectSchemas = {
  create: Joi.object({
    name: Joi.string().min(3).max(255).required(),
    description: Joi.string().max(1000).optional(),
    settings: Joi.object().optional(),
  }),
  
  update: Joi.object({
    name: Joi.string().min(3).max(255).optional(),
    description: Joi.string().max(1000).optional(),
    settings: Joi.object().optional(),
    is_active: Joi.boolean().optional(),
  }),
};

// Validation target schemas
const validationTargetSchemas = {
  create: Joi.object({
    name: Joi.string().min(3).max(255).required(),
    description: Joi.string().max(1000).optional(),
    type: Joi.string().valid('llm_model', 'code_function', 'api_endpoint', 'data_pipeline', 'ui_component').required(),
    configuration: Joi.object().required(),
    metadata: Joi.object().optional(),
  }),
  
  update: Joi.object({
    name: Joi.string().min(3).max(255).optional(),
    description: Joi.string().max(1000).optional(),
    type: Joi.string().valid('llm_model', 'code_function', 'api_endpoint', 'data_pipeline', 'ui_component').optional(),
    configuration: Joi.object().optional(),
    metadata: Joi.object().optional(),
    is_active: Joi.boolean().optional(),
  }),
};

// Validation suite schemas
const validationSuiteSchemas = {
  create: Joi.object({
    name: Joi.string().min(3).max(255).required(),
    description: Joi.string().max(1000).optional(),
    type: Joi.string().valid('unit', 'integration', 'performance', 'security', 'compliance', 'visual', 'semantic').required(),
    configuration: Joi.object().optional(),
  }),
  
  update: Joi.object({
    name: Joi.string().min(3).max(255).optional(),
    description: Joi.string().max(1000).optional(),
    type: Joi.string().valid('unit', 'integration', 'performance', 'security', 'compliance', 'visual', 'semantic').optional(),
    configuration: Joi.object().optional(),
    is_active: Joi.boolean().optional(),
  }),
};

// Test schemas
const testSchemas = {
  create: Joi.object({
    name: Joi.string().min(3).max(255).required(),
    description: Joi.string().max(1000).optional(),
    test_definition: Joi.object().required(),
    expected_result: Joi.object().optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
    timeout_seconds: Joi.number().integer().min(1).max(3600).default(300),
    retry_count: Joi.number().integer().min(0).max(5).default(0),
  }),
  
  update: Joi.object({
    name: Joi.string().min(3).max(255).optional(),
    description: Joi.string().max(1000).optional(),
    test_definition: Joi.object().optional(),
    expected_result: Joi.object().optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    timeout_seconds: Joi.number().integer().min(1).max(3600).optional(),
    retry_count: Joi.number().integer().min(0).max(5).optional(),
    is_active: Joi.boolean().optional(),
  }),
};

// Validation execution schemas
const validationExecutionSchemas = {
  create: Joi.object({
    configuration: Joi.object().optional(),
    environment: Joi.string().valid('development', 'staging', 'production').default('development'),
  }),
};

// API key schemas
const apiKeySchemas = {
  create: Joi.object({
    key_name: Joi.string().min(3).max(255).required(),
    permissions: Joi.object().optional(),
    expires_at: Joi.date().iso().greater('now').optional(),
  }),
  
  update: Joi.object({
    key_name: Joi.string().min(3).max(255).optional(),
    permissions: Joi.object().optional(),
    expires_at: Joi.date().iso().greater('now').optional(),
    is_active: Joi.boolean().optional(),
  }),
};

// File upload validation
const fileUploadSchemas = {
  codeFile: Joi.object({
    file_path: Joi.string().max(500).required(),
    content: Joi.string().required(),
    language: Joi.string().max(50).optional(),
    version: Joi.string().max(50).optional(),
    metadata: Joi.object().optional(),
  }),
};

// Query parameter validation
const queryParamSchemas = {
  list: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
    search: Joi.string().max(255).optional(),
    status: Joi.string().optional(),
    type: Joi.string().optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    created_after: Joi.date().iso().optional(),
    created_before: Joi.date().iso().optional(),
  }),
};

// Custom validation functions
const customValidations = {
  // Validate JSON string
  validateJSONString: (value, helpers) => {
    try {
      JSON.parse(value);
      return value;
    } catch (error) {
      return helpers.error('any.invalid', { message: 'Must be valid JSON' });
    }
  },
  
  // Validate cron expression
  validateCronExpression: (value, helpers) => {
    const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])|\*\/([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])|\*\/([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])|\*\/([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])|\*\/([1-9]|1[0-2])) (\*|([0-6])|\*\/([0-6]))$/;
    
    if (!cronRegex.test(value)) {
      return helpers.error('any.invalid', { message: 'Must be a valid cron expression' });
    }
    
    return value;
  },
  
  // Validate URL
  validateURL: (value, helpers) => {
    try {
      new URL(value);
      return value;
    } catch (error) {
      return helpers.error('any.invalid', { message: 'Must be a valid URL' });
    }
  },
};

// Sanitization functions
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.trim();
  }
  return input;
};

const sanitizeHTML = (input) => {
  if (typeof input === 'string') {
    return input
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  return input;
};

// Validation middleware factory
const createValidationMiddleware = (schema, property = 'body') => {
  return [
    validateSchema(schema, property),
    (req, res, next) => {
      // Additional sanitization
      if (req[property] && typeof req[property] === 'object') {
        req[property] = sanitizeInput(req[property]);
      }
      next();
    },
  ];
};

module.exports = {
  validateSchema,
  validateRequest,
  createValidationMiddleware,
  
  // Schemas
  commonSchemas,
  userSchemas,
  projectSchemas,
  validationTargetSchemas,
  validationSuiteSchemas,
  testSchemas,
  validationExecutionSchemas,
  apiKeySchemas,
  fileUploadSchemas,
  queryParamSchemas,
  
  // Custom validations
  customValidations,
  
  // Sanitization
  sanitizeInput,
  sanitizeHTML,
};