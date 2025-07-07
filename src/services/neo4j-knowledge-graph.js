const neo4j = require('neo4j-driver');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Neo4j Knowledge Graph Service for Validation Platform
 * Manages test execution relationships, dependencies, and validation insights
 */
class Neo4jKnowledgeGraph {
  constructor() {
    this.driver = null;
    this.session = null;
    this.isConnected = false;
    this.config = {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j',
      maxConnectionPoolSize: parseInt(process.env.NEO4J_MAX_POOL_SIZE) || 50,
      connectionTimeout: parseInt(process.env.NEO4J_CONNECTION_TIMEOUT) || 30000,
      maxTransactionRetryTime: parseInt(process.env.NEO4J_MAX_RETRY_TIME) || 15000
    };
    this.nodeCache = new Map();
    this.relationshipCache = new Map();
  }

  /**
   * Initialize Neo4j connection
   */
  async initialize() {
    try {
      logger.info('Initializing Neo4j Knowledge Graph connection', {
        uri: this.config.uri,
        database: this.config.database
      });

      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionPoolSize: this.config.maxConnectionPoolSize,
          connectionAcquisitionTimeout: this.config.connectionTimeout,
          maxTransactionRetryTime: this.config.maxTransactionRetryTime,
          disableLosslessIntegers: true
        }
      );

      // Test connection
      await this.driver.verifyConnectivity();
      this.isConnected = true;

      // Initialize schema
      await this.initializeSchema();

      logger.info('Neo4j Knowledge Graph initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Neo4j Knowledge Graph:', error);
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  async initializeSchema() {
    const session = this.driver.session({ database: this.config.database });
    
    try {
      // Create constraints and indexes
      const schemaQueries = [
        // Unique constraints
        'CREATE CONSTRAINT test_execution_id IF NOT EXISTS FOR (t:TestExecution) REQUIRE t.execution_id IS UNIQUE',
        'CREATE CONSTRAINT test_case_id IF NOT EXISTS FOR (tc:TestCase) REQUIRE tc.test_id IS UNIQUE',
        'CREATE CONSTRAINT validation_suite_id IF NOT EXISTS FOR (vs:ValidationSuite) REQUIRE vs.suite_id IS UNIQUE',
        'CREATE CONSTRAINT validation_target_id IF NOT EXISTS FOR (vt:ValidationTarget) REQUIRE vt.target_id IS UNIQUE',
        'CREATE CONSTRAINT test_pattern_id IF NOT EXISTS FOR (tp:TestPattern) REQUIRE tp.pattern_id IS UNIQUE',
        'CREATE CONSTRAINT agent_node_id IF NOT EXISTS FOR (a:Agent) REQUIRE a.agent_id IS UNIQUE',
        'CREATE CONSTRAINT environment_id IF NOT EXISTS FOR (e:Environment) REQUIRE e.environment_id IS UNIQUE',
        'CREATE CONSTRAINT component_id IF NOT EXISTS FOR (c:Component) REQUIRE c.component_id IS UNIQUE',

        // Performance indexes
        'CREATE INDEX test_execution_status IF NOT EXISTS FOR (t:TestExecution) ON (t.status)',
        'CREATE INDEX test_execution_timestamp IF NOT EXISTS FOR (t:TestExecution) ON (t.executed_at)',
        'CREATE INDEX test_case_type IF NOT EXISTS FOR (tc:TestCase) ON (tc.test_type)',
        'CREATE INDEX validation_suite_type IF NOT EXISTS FOR (vs:ValidationSuite) ON (vs.suite_type)',
        'CREATE INDEX agent_status IF NOT EXISTS FOR (a:Agent) ON (a.status)',
        'CREATE INDEX component_type IF NOT EXISTS FOR (c:Component) ON (c.component_type)'
      ];

      for (const query of schemaQueries) {
        try {
          await session.run(query);
        } catch (error) {
          // Ignore constraint/index already exists errors
          if (!error.message.includes('already exists')) {
            logger.warn('Schema query failed:', { query, error: error.message });
          }
        }
      }

      logger.info('Neo4j schema initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Neo4j schema:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a test execution node
   */
  async createTestExecution(executionData) {
    const session = this.driver.session({ database: this.config.database });
    
    try {
      const executionId = executionData.execution_id || uuidv4();
      const query = `
        CREATE (te:TestExecution {
          execution_id: $execution_id,
          test_id: $test_id,
          suite_id: $suite_id,
          agent_id: $agent_id,
          status: $status,
          started_at: datetime($started_at),
          completed_at: datetime($completed_at),
          execution_duration: duration($execution_duration),
          priority: $priority,
          retry_count: $retry_count,
          error_message: $error_message,
          result_score: $result_score,
          max_score: $max_score,
          environment: $environment,
          execution_metadata: $execution_metadata,
          created_at: datetime(),
          updated_at: datetime()
        })
        RETURN te
      `;

      const result = await session.run(query, {
        execution_id: executionId,
        test_id: executionData.test_id,
        suite_id: executionData.suite_id || null,
        agent_id: executionData.agent_id || null,
        status: executionData.status || 'pending',
        started_at: executionData.started_at || new Date().toISOString(),
        completed_at: executionData.completed_at || null,
        execution_duration: executionData.execution_duration || 'PT0S',
        priority: executionData.priority || 'medium',
        retry_count: executionData.retry_count || 0,
        error_message: executionData.error_message || null,
        result_score: executionData.result_score || 0,
        max_score: executionData.max_score || 1.0,
        environment: executionData.environment || 'development',
        execution_metadata: executionData.execution_metadata || {}
      });

      const node = result.records[0]?.get('te');
      this.nodeCache.set(`test_execution_${executionId}`, node);
      
      logger.debug('Test execution node created', { executionId });
      return { execution_id: executionId, node };
    } catch (error) {
      logger.error('Failed to create test execution node:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a test case node
   */
  async createTestCase(testCaseData) {
    const session = this.driver.session({ database: this.config.database });
    
    try {
      const testId = testCaseData.test_id || uuidv4();
      const query = `
        CREATE (tc:TestCase {
          test_id: $test_id,
          name: $name,
          description: $description,
          test_type: $test_type,
          complexity_score: $complexity_score,
          estimated_duration: duration($estimated_duration),
          success_rate: $success_rate,
          failure_patterns: $failure_patterns,
          input_schema: $input_schema,
          expected_output: $expected_output,
          validation_rules: $validation_rules,
          tags: $tags,
          created_at: datetime(),
          updated_at: datetime()
        })
        RETURN tc
      `;

      const result = await session.run(query, {
        test_id: testId,
        name: testCaseData.name || 'Unnamed Test',
        description: testCaseData.description || '',
        test_type: testCaseData.test_type || 'unit',
        complexity_score: testCaseData.complexity_score || 0.5,
        estimated_duration: testCaseData.estimated_duration || 'PT5M',
        success_rate: testCaseData.success_rate || 1.0,
        failure_patterns: testCaseData.failure_patterns || [],
        input_schema: testCaseData.input_schema || {},
        expected_output: testCaseData.expected_output || {},
        validation_rules: testCaseData.validation_rules || [],
        tags: testCaseData.tags || []
      });

      const node = result.records[0]?.get('tc');
      this.nodeCache.set(`test_case_${testId}`, node);
      
      logger.debug('Test case node created', { testId });
      return { test_id: testId, node };
    } catch (error) {
      logger.error('Failed to create test case node:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create a validation suite node
   */
  async createValidationSuite(suiteData) {
    const session = this.driver.session({ database: this.config.database });
    
    try {
      const suiteId = suiteData.suite_id || uuidv4();
      const query = `
        CREATE (vs:ValidationSuite {
          suite_id: $suite_id,
          name: $name,
          description: $description,
          suite_type: $suite_type,
          version: $version,
          test_count: $test_count,
          estimated_duration: duration($estimated_duration),
          success_rate: $success_rate,
          configuration: $configuration,
          requirements: $requirements,
          tags: $tags,
          created_at: datetime(),
          updated_at: datetime()
        })
        RETURN vs
      `;

      const result = await session.run(query, {
        suite_id: suiteId,
        name: suiteData.name || 'Unnamed Suite',
        description: suiteData.description || '',
        suite_type: suiteData.suite_type || 'integration',
        version: suiteData.version || '1.0.0',
        test_count: suiteData.test_count || 0,
        estimated_duration: suiteData.estimated_duration || 'PT30M',
        success_rate: suiteData.success_rate || 1.0,
        configuration: suiteData.configuration || {},
        requirements: suiteData.requirements || [],
        tags: suiteData.tags || []
      });

      const node = result.records[0]?.get('vs');
      this.nodeCache.set(`validation_suite_${suiteId}`, node);
      
      logger.debug('Validation suite node created', { suiteId });
      return { suite_id: suiteId, node };
    } catch (error) {
      logger.error('Failed to create validation suite node:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create dependency relationship between test cases
   */
  async createTestDependency(sourceTestId, targetTestId, dependencyData = {}) {
    const session = this.driver.session({ database: this.config.database });
    
    try {
      const query = `
        MATCH (source:TestCase {test_id: $source_test_id})
        MATCH (target:TestCase {test_id: $target_test_id})
        CREATE (source)-[:DEPENDS_ON {
          dependency_type: $dependency_type,
          strength: $strength,
          created_at: datetime()
        }]->(target)
        RETURN source, target
      `;

      const result = await session.run(query, {
        source_test_id: sourceTestId,
        target_test_id: targetTestId,
        dependency_type: dependencyData.dependency_type || 'prerequisite',
        strength: dependencyData.strength || 0.8
      });

      logger.debug('Test dependency created', { sourceTestId, targetTestId });
      return result.records[0];
    } catch (error) {
      logger.error('Failed to create test dependency:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Add test case to validation suite
   */
  async addTestCaseToSuite(suiteId, testId, order = 1, weight = 1.0) {
    const session = this.driver.session({ database: this.config.database });
    
    try {
      const query = `
        MATCH (suite:ValidationSuite {suite_id: $suite_id})
        MATCH (test:TestCase {test_id: $test_id})
        CREATE (suite)-[:CONTAINS {
          order_index: $order_index,
          weight: $weight,
          created_at: datetime()
        }]->(test)
        RETURN suite, test
      `;

      const result = await session.run(query, {
        suite_id: suiteId,
        test_id: testId,
        order_index: order,
        weight: weight
      });

      logger.debug('Test case added to suite', { suiteId, testId });
      return result.records[0];
    } catch (error) {
      logger.error('Failed to add test case to suite:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Query test execution patterns
   */
  async getTestExecutionPatterns(filters = {}) {
    const session = this.driver.session({ database: this.config.database });
    
    try {
      let query = `
        MATCH (te:TestExecution)-[:EXECUTES]->(tc:TestCase)
        OPTIONAL MATCH (te)-[:EXECUTES_IN]->(env:Environment)
        OPTIONAL MATCH (te)-[:VALIDATED_BY]->(agent:Agent)
      `;

      const conditions = [];
      const parameters = {};

      if (filters.status) {
        conditions.push('te.status = $status');
        parameters.status = filters.status;
      }

      if (filters.test_type) {
        conditions.push('tc.test_type = $test_type');
        parameters.test_type = filters.test_type;
      }

      if (filters.environment) {
        conditions.push('env.environment_type = $environment');
        parameters.environment = filters.environment;
      }

      if (filters.date_range) {
        conditions.push('te.executed_at >= datetime($start_date) AND te.executed_at <= datetime($end_date)');
        parameters.start_date = filters.date_range.start;
        parameters.end_date = filters.date_range.end;
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += `
        RETURN te.execution_id as execution_id,
               tc.name as test_name,
               tc.test_type as test_type,
               te.status as status,
               te.execution_duration as duration,
               te.result_score as score,
               env.name as environment,
               agent.name as agent,
               te.executed_at as executed_at
        ORDER BY te.executed_at DESC
        LIMIT ${filters.limit || 100}
      `;

      const result = await session.run(query, parameters);
      
      const patterns = result.records.map(record => ({
        execution_id: record.get('execution_id'),
        test_name: record.get('test_name'),
        test_type: record.get('test_type'),
        status: record.get('status'),
        duration: record.get('duration'),
        score: record.get('score'),
        environment: record.get('environment'),
        agent: record.get('agent'),
        executed_at: record.get('executed_at')
      }));

      return patterns;
    } catch (error) {
      logger.error('Failed to query test execution patterns:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze test dependencies and impact
   */
  async analyzeTestDependencies(testId) {
    const session = this.driver.session({ database: this.config.database });
    
    try {
      const query = `
        MATCH (target:TestCase {test_id: $test_id})
        
        // Get dependencies (tests this test depends on)
        OPTIONAL MATCH path1 = (target)-[:DEPENDS_ON*1..5]->(dependency:TestCase)
        
        // Get dependents (tests that depend on this test)
        OPTIONAL MATCH path2 = (dependent:TestCase)-[:DEPENDS_ON*1..5]->(target)
        
        // Get execution history for analysis
        OPTIONAL MATCH (target)<-[:EXECUTES]-(te:TestExecution)
        
        RETURN target.name as test_name,
               collect(DISTINCT dependency.name) as dependencies,
               collect(DISTINCT dependent.name) as dependents,
               collect({
                 execution_id: te.execution_id,
                 status: te.status,
                 score: te.result_score,
                 executed_at: te.executed_at
               }) as execution_history,
               length(path1) as dependency_depth,
               length(path2) as dependent_depth
      `;

      const result = await session.run(query, { test_id: testId });
      const record = result.records[0];

      if (!record) {
        return null;
      }

      return {
        test_name: record.get('test_name'),
        dependencies: record.get('dependencies').filter(d => d !== null),
        dependents: record.get('dependents').filter(d => d !== null),
        execution_history: record.get('execution_history').filter(h => h.execution_id !== null),
        dependency_depth: record.get('dependency_depth') || 0,
        dependent_depth: record.get('dependent_depth') || 0
      };
    } catch (error) {
      logger.error('Failed to analyze test dependencies:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Get validation insights and recommendations
   */
  async getValidationInsights(filters = {}) {
    const session = this.driver.session({ database: this.config.database });
    
    try {
      const query = `
        MATCH (te:TestExecution)-[:EXECUTES]->(tc:TestCase)
        OPTIONAL MATCH (tc)<-[:CONTAINS]-(vs:ValidationSuite)
        WHERE te.executed_at >= datetime($start_date)
        
        WITH tc, vs, 
             count(te) as total_executions,
             avg(te.result_score) as avg_score,
             sum(CASE WHEN te.status = 'passed' THEN 1 ELSE 0 END) as passed_count,
             sum(CASE WHEN te.status = 'failed' THEN 1 ELSE 0 END) as failed_count,
             avg(duration.inSeconds(te.execution_duration)) as avg_duration_seconds
        
        RETURN tc.test_id as test_id,
               tc.name as test_name,
               tc.test_type as test_type,
               vs.name as suite_name,
               total_executions,
               avg_score,
               passed_count,
               failed_count,
               (toFloat(passed_count) / total_executions) as success_rate,
               avg_duration_seconds,
               tc.complexity_score as complexity_score
        ORDER BY success_rate ASC, avg_score ASC
        LIMIT 50
      `;

      const result = await session.run(query, {
        start_date: filters.start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      });

      const insights = result.records.map(record => ({
        test_id: record.get('test_id'),
        test_name: record.get('test_name'),
        test_type: record.get('test_type'),
        suite_name: record.get('suite_name'),
        total_executions: record.get('total_executions').toNumber(),
        avg_score: record.get('avg_score'),
        passed_count: record.get('passed_count').toNumber(),
        failed_count: record.get('failed_count').toNumber(),
        success_rate: record.get('success_rate'),
        avg_duration_seconds: record.get('avg_duration_seconds'),
        complexity_score: record.get('complexity_score')
      }));

      // Generate recommendations
      const recommendations = this.generateRecommendations(insights);

      return {
        insights,
        recommendations,
        summary: {
          total_tests_analyzed: insights.length,
          avg_success_rate: insights.reduce((acc, i) => acc + i.success_rate, 0) / insights.length,
          high_risk_tests: insights.filter(i => i.success_rate < 0.8).length
        }
      };
    } catch (error) {
      logger.error('Failed to get validation insights:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Generate recommendations based on analysis
   */
  generateRecommendations(insights) {
    const recommendations = [];

    // Identify failing tests
    const failingTests = insights.filter(i => i.success_rate < 0.8);
    if (failingTests.length > 0) {
      recommendations.push({
        type: 'high_failure_rate',
        severity: 'high',
        message: `${failingTests.length} tests have success rate below 80%`,
        affected_tests: failingTests.map(t => t.test_name),
        action: 'Review and fix failing tests'
      });
    }

    // Identify slow tests
    const slowTests = insights.filter(i => i.avg_duration_seconds > 300); // 5 minutes
    if (slowTests.length > 0) {
      recommendations.push({
        type: 'slow_execution',
        severity: 'medium',
        message: `${slowTests.length} tests are taking longer than 5 minutes`,
        affected_tests: slowTests.map(t => t.test_name),
        action: 'Optimize test execution time'
      });
    }

    // Identify low-scoring tests
    const lowScoringTests = insights.filter(i => i.avg_score < 0.7);
    if (lowScoringTests.length > 0) {
      recommendations.push({
        type: 'low_quality_score',
        severity: 'medium',
        message: `${lowScoringTests.length} tests have average quality scores below 70%`,
        affected_tests: lowScoringTests.map(t => t.test_name),
        action: 'Review test quality criteria and expectations'
      });
    }

    return recommendations;
  }

  /**
   * Get system health status
   */
  async getHealthStatus() {
    try {
      if (!this.isConnected || !this.driver) {
        return {
          healthy: false,
          message: 'Neo4j not connected',
          details: { connected: false }
        };
      }

      const session = this.driver.session({ database: this.config.database });
      
      try {
        // Test query to verify connection
        const result = await session.run('RETURN 1 as test');
        
        // Get basic statistics
        const statsQuery = `
          MATCH (te:TestExecution)
          OPTIONAL MATCH (tc:TestCase)
          OPTIONAL MATCH (vs:ValidationSuite)
          RETURN count(DISTINCT te) as executions,
                 count(DISTINCT tc) as test_cases,
                 count(DISTINCT vs) as suites
        `;
        
        const stats = await session.run(statsQuery);
        const record = stats.records[0];

        return {
          healthy: true,
          message: 'Neo4j Knowledge Graph is healthy',
          details: {
            connected: true,
            database: this.config.database,
            executions: record.get('executions').toNumber(),
            test_cases: record.get('test_cases').toNumber(),
            suites: record.get('suites').toNumber(),
            cache_size: this.nodeCache.size
          }
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      return {
        healthy: false,
        message: error.message,
        details: { error: error.message }
      };
    }
  }

  /**
   * Cleanup and close connections
   */
  async shutdown() {
    try {
      if (this.session) {
        await this.session.close();
        this.session = null;
      }
      
      if (this.driver) {
        await this.driver.close();
        this.driver = null;
      }
      
      this.isConnected = false;
      this.nodeCache.clear();
      this.relationshipCache.clear();
      
      logger.info('Neo4j Knowledge Graph shutdown completed');
    } catch (error) {
      logger.error('Error during Neo4j shutdown:', error);
      throw error;
    }
  }
}

module.exports = { Neo4jKnowledgeGraph };