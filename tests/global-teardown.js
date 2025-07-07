const { performance } = require('perf_hooks');

module.exports = async () => {
  // Calculate total test execution time
  const testEndTime = performance.now();
  const totalTestTime = testEndTime - global.testStartTime;
  
  console.log(`\nTest execution completed in ${totalTestTime.toFixed(2)}ms`);
  
  // Cleanup test environment
  console.log('Cleaning up test environment...');
  
  // Clean up any test data
  delete global.testFixtures;
  
  // Reset environment variables
  delete process.env.NODE_ENV;
  delete process.env.LOG_LEVEL;
  delete process.env.DB_HOST;
  delete process.env.DB_PORT;
  delete process.env.DB_NAME;
  delete process.env.DB_USER;
  delete process.env.DB_PASSWORD;
  delete process.env.REDIS_HOST;
  delete process.env.REDIS_PORT;
  delete process.env.NEO4J_URI;
  delete process.env.NEO4J_USERNAME;
  delete process.env.NEO4J_PASSWORD;
  
  console.log('Test environment cleanup complete.');
};