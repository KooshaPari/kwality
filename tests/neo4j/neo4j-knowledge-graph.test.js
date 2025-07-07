// Mock neo4j-driver before requiring the service
const mockSession = {
  run: jest.fn(),
  close: jest.fn()
};

const mockDriver = {
  session: jest.fn(() => mockSession),
  verifyConnectivity: jest.fn(),
  close: jest.fn()
};

const mockNeo4j = {
  driver: jest.fn(() => mockDriver),
  auth: {
    basic: jest.fn()
  }
};

jest.doMock('neo4j-driver', () => mockNeo4j);

const { Neo4jKnowledgeGraph } = require('../../src/services/neo4j-knowledge-graph');

describe('Neo4jKnowledgeGraph', () => {
  let knowledgeGraph;

  beforeEach(() => {
    // Clear environment variables that might interfere
    delete process.env.NEO4J_URI;
    delete process.env.NEO4J_USERNAME;
    delete process.env.NEO4J_PASSWORD;
    delete process.env.NEO4J_DATABASE;
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset mock implementations
    mockSession.run.mockResolvedValue({ records: [] });
    mockSession.close.mockResolvedValue();
    mockDriver.session.mockReturnValue(mockSession);
    mockDriver.verifyConnectivity.mockResolvedValue(true);
    mockDriver.close.mockResolvedValue();
    mockNeo4j.driver.mockReturnValue(mockDriver);

    knowledgeGraph = new Neo4jKnowledgeGraph();
  });

  afterEach(async () => {
    if (knowledgeGraph && knowledgeGraph.isConnected) {
      await knowledgeGraph.shutdown();
    }
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should initialize with default configuration', () => {
      expect(knowledgeGraph.config).toBeDefined();
      expect(knowledgeGraph.config.uri).toBe('bolt://localhost:7687');
      expect(knowledgeGraph.config.username).toBe('neo4j');
      expect(knowledgeGraph.config.database).toBe('neo4j');
      expect(knowledgeGraph.isConnected).toBe(false);
    });

    test('should initialize connection successfully', async () => {
      mockDriver.verifyConnectivity.mockResolvedValue(true);
      mockSession.run.mockResolvedValue({ records: [] });

      await knowledgeGraph.initialize();

      expect(knowledgeGraph.isConnected).toBe(true);
      expect(mockDriver.verifyConnectivity).toHaveBeenCalled();
      expect(mockSession.run).toHaveBeenCalled(); // Schema initialization
    });

    test('should handle initialization errors', async () => {
      mockDriver.verifyConnectivity.mockRejectedValue(new Error('Connection failed'));

      await expect(knowledgeGraph.initialize()).rejects.toThrow('Connection failed');
      expect(knowledgeGraph.isConnected).toBe(false);
    });

    test('should use environment variables for configuration', () => {
      process.env.NEO4J_URI = 'bolt://test:7687';
      process.env.NEO4J_USERNAME = 'testuser';
      process.env.NEO4J_PASSWORD = 'testpass';
      process.env.NEO4J_DATABASE = 'testdb';

      const testKnowledgeGraph = new Neo4jKnowledgeGraph();

      expect(testKnowledgeGraph.config.uri).toBe('bolt://test:7687');
      expect(testKnowledgeGraph.config.username).toBe('testuser');
      expect(testKnowledgeGraph.config.password).toBe('testpass');
      expect(testKnowledgeGraph.config.database).toBe('testdb');

      // Cleanup
      delete process.env.NEO4J_URI;
      delete process.env.NEO4J_USERNAME;
      delete process.env.NEO4J_PASSWORD;
      delete process.env.NEO4J_DATABASE;
    });
  });

  describe('Schema Initialization', () => {
    beforeEach(async () => {
      await knowledgeGraph.initialize();
    });

    test('should create constraints and indexes', async () => {
      await knowledgeGraph.initializeSchema();

      // Verify that schema creation queries were run
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE CONSTRAINT test_execution_id')
      );
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE INDEX test_execution_status')
      );
    });

    test('should handle existing constraints gracefully', async () => {
      mockSession.run.mockRejectedValue(new Error('constraint already exists'));

      // Should not throw error for existing constraints
      await expect(knowledgeGraph.initializeSchema()).resolves.not.toThrow();
    });
  });

  describe('Node Creation', () => {
    beforeEach(async () => {
      await knowledgeGraph.initialize();
    });

    test('should create test execution node', async () => {
      const mockNode = { properties: { execution_id: 'test-exec-1' } };
      mockSession.run.mockResolvedValue({
        records: [{ get: jest.fn(() => mockNode) }]
      });

      const executionData = {
        test_id: 'test-1',
        suite_id: 'suite-1',
        status: 'passed',
        result_score: 0.95
      };

      const result = await knowledgeGraph.createTestExecution(executionData);

      expect(result.execution_id).toBeDefined();
      expect(result.node).toBe(mockNode);
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (te:TestExecution'),
        expect.objectContaining({
          test_id: 'test-1',
          suite_id: 'suite-1',
          status: 'passed',
          result_score: 0.95
        })
      );
    });

    test('should create test case node', async () => {
      const mockNode = { properties: { test_id: 'test-case-1' } };
      mockSession.run.mockResolvedValue({
        records: [{ get: jest.fn(() => mockNode) }]
      });

      const testCaseData = {
        name: 'Sample Test',
        description: 'A sample test case',
        test_type: 'unit',
        complexity_score: 0.7
      };

      const result = await knowledgeGraph.createTestCase(testCaseData);

      expect(result.test_id).toBeDefined();
      expect(result.node).toBe(mockNode);
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (tc:TestCase'),
        expect.objectContaining({
          name: 'Sample Test',
          test_type: 'unit',
          complexity_score: 0.7
        })
      );
    });

    test('should create validation suite node', async () => {
      const mockNode = { properties: { suite_id: 'suite-1' } };
      mockSession.run.mockResolvedValue({
        records: [{ get: jest.fn(() => mockNode) }]
      });

      const suiteData = {
        name: 'Integration Suite',
        description: 'Integration test suite',
        suite_type: 'integration',
        version: '1.0.0'
      };

      const result = await knowledgeGraph.createValidationSuite(suiteData);

      expect(result.suite_id).toBeDefined();
      expect(result.node).toBe(mockNode);
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (vs:ValidationSuite'),
        expect.objectContaining({
          name: 'Integration Suite',
          suite_type: 'integration',
          version: '1.0.0'
        })
      );
    });
  });

  describe('Relationship Creation', () => {
    beforeEach(async () => {
      await knowledgeGraph.initialize();
    });

    test('should create test dependency relationship', async () => {
      const mockRecord = { get: jest.fn() };
      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      const result = await knowledgeGraph.createTestDependency(
        'test-1',
        'test-2',
        { dependency_type: 'prerequisite', strength: 0.9 }
      );

      expect(result).toBe(mockRecord);
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (source)-[:DEPENDS_ON'),
        expect.objectContaining({
          source_test_id: 'test-1',
          target_test_id: 'test-2',
          dependency_type: 'prerequisite',
          strength: 0.9
        })
      );
    });

    test('should add test case to suite', async () => {
      const mockRecord = { get: jest.fn() };
      mockSession.run.mockResolvedValue({
        records: [mockRecord]
      });

      const result = await knowledgeGraph.addTestCaseToSuite(
        'suite-1',
        'test-1',
        1,
        0.8
      );

      expect(result).toBe(mockRecord);
      expect(mockSession.run).toHaveBeenCalledWith(
        expect.stringContaining('CREATE (suite)-[:CONTAINS'),
        expect.objectContaining({
          suite_id: 'suite-1',
          test_id: 'test-1',
          order_index: 1,
          weight: 0.8
        })
      );
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      await knowledgeGraph.initialize();
    });

    test('should query test execution patterns', async () => {
      const mockRecords = [
        {
          get: jest.fn()
            .mockReturnValueOnce('exec-1')
            .mockReturnValueOnce('Test 1')
            .mockReturnValueOnce('unit')
            .mockReturnValueOnce('passed')
            .mockReturnValueOnce('PT5M')
            .mockReturnValueOnce(0.95)
            .mockReturnValueOnce('development')
            .mockReturnValueOnce('agent-1')
            .mockReturnValueOnce('2023-01-01T00:00:00Z')
        }
      ];
      mockSession.run.mockResolvedValue({ records: mockRecords });

      const patterns = await knowledgeGraph.getTestExecutionPatterns({
        status: 'passed',
        test_type: 'unit'
      });

      expect(patterns).toHaveLength(1);
      expect(patterns[0]).toEqual({
        execution_id: 'exec-1',
        test_name: 'Test 1',
        test_type: 'unit',
        status: 'passed',
        duration: 'PT5M',
        score: 0.95,
        environment: 'development',
        agent: 'agent-1',
        executed_at: '2023-01-01T00:00:00Z'
      });
    });

    test('should analyze test dependencies', async () => {
      const mockRecord = {
        get: jest.fn()
          .mockReturnValueOnce('Test 1')
          .mockReturnValueOnce(['Dependency 1', 'Dependency 2'])
          .mockReturnValueOnce(['Dependent 1'])
          .mockReturnValueOnce([{ execution_id: 'exec-1', status: 'passed' }])
          .mockReturnValueOnce(2)
          .mockReturnValueOnce(1)
      };
      mockSession.run.mockResolvedValue({ records: [mockRecord] });

      const analysis = await knowledgeGraph.analyzeTestDependencies('test-1');

      expect(analysis).toEqual({
        test_name: 'Test 1',
        dependencies: ['Dependency 1', 'Dependency 2'],
        dependents: ['Dependent 1'],
        execution_history: [{ execution_id: 'exec-1', status: 'passed' }],
        dependency_depth: 2,
        dependent_depth: 1
      });
    });

    test('should get validation insights', async () => {
      const mockRecords = [
        {
          get: jest.fn()
            .mockReturnValueOnce('test-1')
            .mockReturnValueOnce('Test 1')
            .mockReturnValueOnce('unit')
            .mockReturnValueOnce('Suite 1')
            .mockReturnValueOnce({ toNumber: () => 10 })
            .mockReturnValueOnce(0.85)
            .mockReturnValueOnce({ toNumber: () => 8 })
            .mockReturnValueOnce({ toNumber: () => 2 })
            .mockReturnValueOnce(0.8)
            .mockReturnValueOnce(45.5)
            .mockReturnValueOnce(0.7)
        }
      ];
      mockSession.run.mockResolvedValue({ records: mockRecords });

      const insights = await knowledgeGraph.getValidationInsights();

      expect(insights.insights).toHaveLength(1);
      expect(insights.insights[0]).toEqual({
        test_id: 'test-1',
        test_name: 'Test 1',
        test_type: 'unit',
        suite_name: 'Suite 1',
        total_executions: 10,
        avg_score: 0.85,
        passed_count: 8,
        failed_count: 2,
        success_rate: 0.8,
        avg_duration_seconds: 45.5,
        complexity_score: 0.7
      });

      expect(insights.recommendations).toBeDefined();
      expect(insights.summary).toBeDefined();
    });
  });

  describe('Recommendations', () => {
    beforeEach(async () => {
      await knowledgeGraph.initialize();
    });

    test('should generate failure rate recommendations', () => {
      const insights = [
        {
          test_name: 'Failing Test',
          success_rate: 0.6,
          avg_duration_seconds: 30,
          avg_score: 0.8
        }
      ];

      const recommendations = knowledgeGraph.generateRecommendations(insights);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('high_failure_rate');
      expect(recommendations[0].severity).toBe('high');
      expect(recommendations[0].affected_tests).toContain('Failing Test');
    });

    test('should generate slow execution recommendations', () => {
      const insights = [
        {
          test_name: 'Slow Test',
          success_rate: 0.9,
          avg_duration_seconds: 400, // > 5 minutes
          avg_score: 0.8
        }
      ];

      const recommendations = knowledgeGraph.generateRecommendations(insights);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('slow_execution');
      expect(recommendations[0].severity).toBe('medium');
      expect(recommendations[0].affected_tests).toContain('Slow Test');
    });

    test('should generate low quality score recommendations', () => {
      const insights = [
        {
          test_name: 'Low Quality Test',
          success_rate: 0.9,
          avg_duration_seconds: 30,
          avg_score: 0.6 // < 0.7
        }
      ];

      const recommendations = knowledgeGraph.generateRecommendations(insights);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('low_quality_score');
      expect(recommendations[0].severity).toBe('medium');
      expect(recommendations[0].affected_tests).toContain('Low Quality Test');
    });

    test('should generate multiple recommendations', () => {
      const insights = [
        {
          test_name: 'Problem Test',
          success_rate: 0.6, // Failing
          avg_duration_seconds: 400, // Slow
          avg_score: 0.6 // Low quality
        }
      ];

      const recommendations = knowledgeGraph.generateRecommendations(insights);

      expect(recommendations).toHaveLength(3);
      expect(recommendations.map(r => r.type)).toEqual([
        'high_failure_rate',
        'slow_execution',
        'low_quality_score'
      ]);
    });
  });

  describe('Health Status', () => {
    test('should return unhealthy status when not connected', async () => {
      const status = await knowledgeGraph.getHealthStatus();

      expect(status.healthy).toBe(false);
      expect(status.message).toBe('Neo4j not connected');
    });

    test('should return healthy status when connected', async () => {
      await knowledgeGraph.initialize();

      // Mock health query response
      const healthRecord = {
        get: jest.fn()
          .mockReturnValueOnce({ toNumber: () => 100 }) // executions
          .mockReturnValueOnce({ toNumber: () => 50 })  // test_cases
          .mockReturnValueOnce({ toNumber: () => 10 })  // suites
      };
      mockSession.run
        .mockResolvedValueOnce({ records: [{}] }) // Connection test
        .mockResolvedValueOnce({ records: [healthRecord] }); // Stats query

      const status = await knowledgeGraph.getHealthStatus();

      expect(status.healthy).toBe(true);
      expect(status.message).toBe('Neo4j Knowledge Graph is healthy');
      expect(status.details.executions).toBe(100);
      expect(status.details.test_cases).toBe(50);
      expect(status.details.suites).toBe(10);
    });

    test('should handle health check errors', async () => {
      await knowledgeGraph.initialize();

      mockSession.run.mockRejectedValue(new Error('Database error'));

      const status = await knowledgeGraph.getHealthStatus();

      expect(status.healthy).toBe(false);
      expect(status.message).toBe('Database error');
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully when not connected', async () => {
      await expect(knowledgeGraph.shutdown()).resolves.not.toThrow();
      expect(knowledgeGraph.isConnected).toBe(false);
    });

    test('should shutdown gracefully when connected', async () => {
      await knowledgeGraph.initialize();

      expect(knowledgeGraph.isConnected).toBe(true);

      await knowledgeGraph.shutdown();

      expect(mockDriver.close).toHaveBeenCalled();
      expect(knowledgeGraph.isConnected).toBe(false);
      expect(knowledgeGraph.driver).toBeNull();
      expect(knowledgeGraph.nodeCache.size).toBe(0);
    });

    test('should handle shutdown errors', async () => {
      await knowledgeGraph.initialize();

      mockDriver.close.mockRejectedValue(new Error('Shutdown error'));

      await expect(knowledgeGraph.shutdown()).rejects.toThrow('Shutdown error');
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await knowledgeGraph.initialize();
    });

    test('should handle node creation errors', async () => {
      mockSession.run.mockRejectedValue(new Error('Node creation failed'));

      await expect(knowledgeGraph.createTestExecution({})).rejects.toThrow('Node creation failed');
    });

    test('should handle relationship creation errors', async () => {
      mockSession.run.mockRejectedValue(new Error('Relationship creation failed'));

      await expect(knowledgeGraph.createTestDependency('test-1', 'test-2')).rejects.toThrow('Relationship creation failed');
    });

    test('should handle query errors', async () => {
      mockSession.run.mockRejectedValue(new Error('Query failed'));

      await expect(knowledgeGraph.getTestExecutionPatterns()).rejects.toThrow('Query failed');
    });
  });

  describe('Caching', () => {
    beforeEach(async () => {
      mockDriver.verifyConnectivity.mockResolvedValue(true);
      mockSession.run.mockResolvedValue({ records: [] });
      await knowledgeGraph.initialize();
    });

    test('should cache created nodes', async () => {
      const mockNode = { properties: { execution_id: 'test-exec-1' } };
      mockSession.run.mockResolvedValue({
        records: [{ get: jest.fn(() => mockNode) }]
      });

      const result = await knowledgeGraph.createTestExecution({ test_id: 'test-1' });

      expect(knowledgeGraph.nodeCache.has(`test_execution_${result.execution_id}`)).toBe(true);
      expect(knowledgeGraph.nodeCache.get(`test_execution_${result.execution_id}`)).toBe(mockNode);
    });

    test('should clear cache on shutdown', async () => {
      // Add something to cache
      knowledgeGraph.nodeCache.set('test-key', 'test-value');
      expect(knowledgeGraph.nodeCache.size).toBe(1);

      await knowledgeGraph.shutdown();

      expect(knowledgeGraph.nodeCache.size).toBe(0);
    });
  });
});