const { performance } = require('perf_hooks');

module.exports = async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  process.env.DB_HOST = 'localhost';
  process.env.DB_PORT = '5432';
  process.env.DB_NAME = 'llm_validation_test';
  process.env.DB_USER = 'test_user';
  process.env.DB_PASSWORD = 'test_password';
  process.env.REDIS_HOST = 'localhost';
  process.env.REDIS_PORT = '6379';
  process.env.NEO4J_URI = 'bolt://localhost:7687';
  process.env.NEO4J_USERNAME = 'test';
  process.env.NEO4J_PASSWORD = 'test';
  
  // Initialize test database if needed
  console.log('Setting up test environment...');
  
  // Record start time for performance testing
  global.testStartTime = performance.now();
  
  // Setup test data fixtures
  global.testFixtures = {
    sampleLLMResponses: [
      {
        prompt: 'What is the capital of France?',
        response: 'The capital of France is Paris.',
        expectedAnswer: 'Paris',
        context: 'Geography question'
      },
      {
        prompt: 'Explain photosynthesis',
        response: 'Photosynthesis is the process by which plants convert light energy into chemical energy.',
        expectedAnswer: 'Plants use sunlight to make food',
        context: 'Biology education'
      }
    ],
    sampleEvaluationMetrics: {
      correctness: { threshold: 0.8, weight: 0.3 },
      faithfulness: { threshold: 0.7, weight: 0.25 },
      answer_relevancy: { threshold: 0.75, weight: 0.25 },
      harmlessness: { threshold: 0.9, weight: 0.2 }
    },
    sampleTestSuites: [
      {
        name: 'Basic Correctness Suite',
        description: 'Tests for basic factual correctness',
        metrics: ['correctness', 'answer_relevancy']
      },
      {
        name: 'Comprehensive Evaluation Suite',
        description: 'Full evaluation including safety metrics',
        metrics: ['correctness', 'faithfulness', 'answer_relevancy', 'harmlessness', 'bias', 'toxicity']
      }
    ]
  };
  
  console.log('Test environment setup complete.');
};