// Global test configuration
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};

// Test environment setup
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Mock external dependencies
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  logValidation: jest.fn()
}));

jest.mock('../src/utils/telemetry', () => ({
  trackError: jest.fn(),
  measurePerformance: jest.fn((name, fn) => fn())
}));

jest.mock('../src/utils/metrics', () => ({
  recordValidationExecution: jest.fn()
}));

// Database mock
jest.mock('../database/config/database', () => ({
  query: jest.fn(),
  transaction: jest.fn()
}));

// Test timeout configuration
jest.setTimeout(30000);

// Global teardown
afterEach(() => {
  jest.clearAllMocks();
});