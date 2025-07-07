const { BurrPytestIntegration } = require('../../src/services/burr-pytest-integration');
const fs = require('fs');
const path = require('path');

describe('BurrPytestIntegration', () => {
  let integration;
  let testWorkingDir;

  beforeAll(() => {
    // Create temporary test directory
    testWorkingDir = path.join(__dirname, '../../temp-test-burr-pytest');
    if (!fs.existsSync(testWorkingDir)) {
      fs.mkdirSync(testWorkingDir, { recursive: true });
    }
  });

  beforeEach(() => {
    integration = new BurrPytestIntegration();
    // Override working directory for tests
    integration.config.workingDirectory = testWorkingDir;
    integration.config.timeout = 10000; // Shorter timeout for tests
  });

  afterEach(async () => {
    if (integration && integration.isInitialized) {
      await integration.shutdown();
    }
  });

  afterAll(() => {
    // Cleanup test directory
    if (fs.existsSync(testWorkingDir)) {
      fs.rmSync(testWorkingDir, { recursive: true, force: true });
    }
  });

  describe('Configuration', () => {
    test('should initialize with default configuration', () => {
      expect(integration.config).toBeDefined();
      expect(integration.config.pythonPath).toBe('python3');
      expect(integration.config.pytestPath).toBe('pytest');
      expect(integration.config.maxConcurrency).toBe(4);
      expect(integration.config.timeout).toBe(10000);
      expect(integration.isInitialized).toBe(false);
    });

    test('should use environment variables for configuration', () => {
      process.env.PYTHON_PATH = '/usr/bin/python3.9';
      process.env.PYTEST_PATH = '/usr/local/bin/pytest';
      process.env.PYTEST_MAX_CONCURRENCY = '8';
      process.env.PYTEST_TIMEOUT = '600000';
      process.env.PYTEST_COVERAGE = 'true';
      process.env.PYTEST_COVERAGE_THRESHOLD = '90';

      const envIntegration = new BurrPytestIntegration();

      expect(envIntegration.config.pythonPath).toBe('/usr/bin/python3.9');
      expect(envIntegration.config.pytestPath).toBe('/usr/local/bin/pytest');
      expect(envIntegration.config.maxConcurrency).toBe(8);
      expect(envIntegration.config.timeout).toBe(600000);
      expect(envIntegration.config.coverage.enabled).toBe(true);
      expect(envIntegration.config.coverage.threshold).toBe(90);

      // Cleanup
      delete process.env.PYTHON_PATH;
      delete process.env.PYTEST_PATH;
      delete process.env.PYTEST_MAX_CONCURRENCY;
      delete process.env.PYTEST_TIMEOUT;
      delete process.env.PYTEST_COVERAGE;
      delete process.env.PYTEST_COVERAGE_THRESHOLD;
    });
  });

  describe('Initialization', () => {
    test('should handle initialization when Python is not available', async () => {
      integration.config.pythonPath = 'nonexistent-python';
      
      await expect(integration.initialize()).rejects.toThrow('Python environment setup incomplete');
      expect(integration.isInitialized).toBe(false);
    });

    test('should create working directory structure', async () => {
      await integration.createWorkingDirectoryStructure();

      const expectedDirectories = [
        testWorkingDir,
        path.join(testWorkingDir, 'tests'),
        path.join(testWorkingDir, 'fixtures'),
        path.join(testWorkingDir, 'workflows'),
        path.join(testWorkingDir, 'state-machines'),
        path.join(testWorkingDir, 'reports')
      ];

      for (const dir of expectedDirectories) {
        expect(fs.existsSync(dir)).toBe(true);
      }
    });

    test('should initialize Burr templates', async () => {
      await integration.createWorkingDirectoryStructure();
      await integration.initializeBurrTemplates();

      const workflowsDir = path.join(testWorkingDir, 'workflows');
      const expectedTemplates = [
        'basic-tdd-workflow.py',
        'llm-validation-workflow.py',
        'integration-test-workflow.py',
        'performance-test-workflow.py'
      ];

      for (const template of expectedTemplates) {
        const templatePath = path.join(workflowsDir, template);
        expect(fs.existsSync(templatePath)).toBe(true);
        
        const content = fs.readFileSync(templatePath, 'utf8');
        expect(content).toContain('from burr.core import ApplicationBuilder');
        expect(content).toContain('@action');
      }
    });

    test('should setup pytest configuration', async () => {
      await integration.createWorkingDirectoryStructure();
      await integration.setupPytestConfiguration();

      const configPath = path.join(testWorkingDir, 'pyproject.toml');
      expect(fs.existsSync(configPath)).toBe(true);

      const content = fs.readFileSync(configPath, 'utf8');
      expect(content).toContain('[tool.pytest.ini_options]');
      expect(content).toContain('testpaths = ["tests"]');
      expect(content).toContain('python_files = "test_*.py"');
      expect(content).toContain('"unit: Unit tests"');
      expect(content).toContain('"burr: Burr state machine tests"');
    });
  });

  describe('TDD Workflow Creation', () => {
    beforeEach(async () => {
      await integration.createWorkingDirectoryStructure();
      await integration.initializeBurrTemplates();
    });

    test('should create TDD workflow with default configuration', async () => {
      const workflowConfig = {
        name: 'Test Workflow',
        description: 'A test workflow for TDD'
      };

      const result = await integration.createTDDWorkflow(workflowConfig);

      expect(result.workflow_id).toBeDefined();
      expect(result.workflow).toBeDefined();
      expect(result.workflow.name).toBe('Test Workflow');
      expect(result.workflow.description).toBe('A test workflow for TDD');
      expect(result.workflow.phases).toEqual(['red', 'green', 'refactor']);
      expect(result.workflow.currentPhase).toBe('red');
      expect(result.workflow.createdAt).toBeDefined();

      // Verify workflow is stored
      expect(integration.workflows.has(result.workflow_id)).toBe(true);
    });

    test('should create TDD workflow with custom configuration', async () => {
      const workflowConfig = {
        name: 'Custom Workflow',
        description: 'A custom workflow',
        phases: ['design', 'implement', 'test', 'deploy']
      };

      const result = await integration.createTDDWorkflow(workflowConfig);

      expect(result.workflow.phases).toEqual(['design', 'implement', 'test', 'deploy']);
      expect(result.workflow.currentPhase).toBe('red'); // Default current phase
    });

    test('should generate workflow-specific test files', async () => {
      const workflowConfig = {
        name: 'Test Generation Workflow',
        description: 'Tests test file generation'
      };

      const result = await integration.createTDDWorkflow(workflowConfig);
      
      const testDir = path.join(testWorkingDir, 'tests', result.workflow_id);
      const testFile = path.join(testDir, `test_${result.workflow_id}.py`);
      
      expect(fs.existsSync(testDir)).toBe(true);
      expect(fs.existsSync(testFile)).toBe(true);

      const content = fs.readFileSync(testFile, 'utf8');
      expect(content).toContain('import pytest');
      expect(content).toContain('from burr.core import ApplicationBuilder');
      expect(content).toContain(`class Test${result.workflow.name.replace(/\s+/g, '')}:`);
      expect(content).toContain('@pytest.mark.unit');
      expect(content).toContain('@pytest.mark.burr');
    });
  });

  describe('TDD Phase Execution', () => {
    let workflowId;

    beforeEach(async () => {
      await integration.createWorkingDirectoryStructure();
      await integration.initializeBurrTemplates();

      const workflowConfig = {
        name: 'Phase Test Workflow',
        description: 'Tests phase execution'
      };

      const result = await integration.createTDDWorkflow(workflowConfig);
      workflowId = result.workflow_id;
    });

    test('should handle unknown TDD phase', async () => {
      await expect(integration.executeTDDPhase(workflowId, 'unknown')).rejects.toThrow('Unknown TDD phase: unknown');
    });

    test('should handle non-existent workflow', async () => {
      await expect(integration.executeTDDPhase('non-existent-id', 'red')).rejects.toThrow('Workflow not found: non-existent-id');
    });

    test('should track phase execution state', async () => {
      // Mock pytest command to avoid actual execution
      const originalRunCommand = integration.runCommand;
      integration.runCommand = jest.fn().mockResolvedValue('mock pytest output');

      // Mock file system for test results
      const originalExistsSync = fs.existsSync;
      fs.existsSync = jest.fn().mockImplementation((path) => {
        if (path.includes('test-results.json')) {
          return true;
        }
        return originalExistsSync(path);
      });

      const originalReadFileSync = fs.readFileSync;
      fs.readFileSync = jest.fn().mockImplementation((path, encoding) => {
        if (path.includes('test-results.json')) {
          return JSON.stringify({
            summary: { passed: 0, failed: 1, skipped: 0, error: 0, total: 1 },
            duration: 1.5,
            coverage: { percent: 80 },
            tests: []
          });
        }
        return originalReadFileSync(path, encoding);
      });

      try {
        // This should fail because we expect tests to fail in red phase
        const execution = await integration.executeTDDPhase(workflowId, 'red');

        expect(execution.execution_id).toBeDefined();
        expect(execution.workflow_id).toBe(workflowId);
        expect(execution.phase).toBe('red');
        expect(execution.status).toBe('passed'); // Red phase succeeds when tests fail
        expect(execution.results.success).toBe(true);
        expect(execution.started_at).toBeDefined();
        expect(execution.completed_at).toBeDefined();

        // Verify execution is stored
        expect(integration.testResults.has(execution.execution_id)).toBe(true);
        expect(integration.activeTests.has(execution.execution_id)).toBe(false);
      } finally {
        // Restore original functions
        integration.runCommand = originalRunCommand;
        fs.existsSync = originalExistsSync;
        fs.readFileSync = originalReadFileSync;
      }
    });
  });

  describe('Phase Logic', () => {
    beforeEach(async () => {
      await integration.createWorkingDirectoryStructure();
      await integration.initializeBurrTemplates();
    });

    test('should determine next phase correctly', () => {
      expect(integration.getNextPhase('red', true)).toBe('green');
      expect(integration.getNextPhase('green', true)).toBe('refactor');
      expect(integration.getNextPhase('refactor', true)).toBe('red');
      
      // Should stay in current phase if not successful
      expect(integration.getNextPhase('red', false)).toBe('red');
      expect(integration.getNextPhase('green', false)).toBe('green');
      expect(integration.getNextPhase('refactor', false)).toBe('refactor');
    });

    test('should get test files for workflow', async () => {
      const workflowConfig = { name: 'Test Files Workflow' };
      const result = await integration.createTDDWorkflow(workflowConfig);
      
      const testFiles = await integration.getTestFiles(result.workflow);
      expect(testFiles).toEqual([
        path.join(testWorkingDir, 'tests', result.workflow_id, `test_${result.workflow_id}.py`)
      ]);
    });

    test('should return empty array for workflow without test files', async () => {
      const workflow = {
        id: 'no-tests-workflow',
        name: 'No Tests Workflow'
      };

      const testFiles = await integration.getTestFiles(workflow);
      expect(testFiles).toEqual([]);
    });
  });

  describe('Workflow Management', () => {
    let workflowId;

    beforeEach(async () => {
      await integration.createWorkingDirectoryStructure();
      await integration.initializeBurrTemplates();

      const workflowConfig = {
        name: 'Management Test Workflow',
        description: 'Tests workflow management'
      };

      const result = await integration.createTDDWorkflow(workflowConfig);
      workflowId = result.workflow_id;
    });

    test('should get workflow status', () => {
      const status = integration.getWorkflowStatus(workflowId);

      expect(status).toBeDefined();
      expect(status.workflow_id).toBe(workflowId);
      expect(status.name).toBe('Management Test Workflow');
      expect(status.current_phase).toBe('red');
      expect(status.created_at).toBeDefined();
      expect(status.updated_at).toBeDefined();
      expect(status.active_execution).toBeNull();
      expect(status.total_executions).toBe(0);
    });

    test('should return null for non-existent workflow', () => {
      const status = integration.getWorkflowStatus('non-existent-id');
      expect(status).toBeNull();
    });

    test('should get workflow insights', () => {
      const insights = integration.getWorkflowInsights(workflowId);

      expect(insights).toBeDefined();
      expect(insights.workflow_id).toBe(workflowId);
      expect(insights.name).toBe('Management Test Workflow');
      expect(insights.total_executions).toBe(0);
      expect(insights.phase_statistics).toEqual({});
      expect(insights.success_rate).toBe(0);
      expect(insights.average_cycle_time).toBe(0);
      expect(insights.recommendations).toEqual([{
        type: 'no_executions',
        message: 'No test executions found. Start with the Red phase.',
        priority: 'high'
      }]);
    });

    test('should return null insights for non-existent workflow', () => {
      const insights = integration.getWorkflowInsights('non-existent-id');
      expect(insights).toBeNull();
    });
  });

  describe('Workflow Recommendations', () => {
    test('should generate no executions recommendation', () => {
      const recommendations = integration.generateWorkflowRecommendations([]);
      
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('no_executions');
      expect(recommendations[0].priority).toBe('high');
    });

    test('should generate high failure rate recommendation', () => {
      const executions = [
        { status: 'failed', started_at: '2023-01-01T00:00:00Z', completed_at: '2023-01-01T00:01:00Z' },
        { status: 'failed', started_at: '2023-01-01T00:02:00Z', completed_at: '2023-01-01T00:03:00Z' },
        { status: 'passed', started_at: '2023-01-01T00:04:00Z', completed_at: '2023-01-01T00:05:00Z' }
      ];

      const recommendations = integration.generateWorkflowRecommendations(executions);
      
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('high_failure_rate');
      expect(recommendations[0].priority).toBe('high');
      expect(recommendations[0].message).toContain('67%');
    });

    test('should generate slow execution recommendation', () => {
      const executions = [
        { 
          status: 'passed', 
          started_at: '2023-01-01T00:00:00Z', 
          completed_at: '2023-01-01T00:10:00Z' // 10 minutes
        }
      ];

      const recommendations = integration.generateWorkflowRecommendations(executions);
      
      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].type).toBe('slow_execution');
      expect(recommendations[0].priority).toBe('medium');
    });
  });

  describe('Template Generation', () => {
    beforeEach(async () => {
      await integration.createWorkingDirectoryStructure();
      await integration.initializeBurrTemplates();
    });

    test('should generate basic TDD workflow template', () => {
      const template = integration.generateBasicTDDWorkflow();
      
      expect(template).toContain('from burr.core import ApplicationBuilder');
      expect(template).toContain('@action');
      expect(template).toContain('def red_phase(state: State)');
      expect(template).toContain('def green_phase(state: State)');
      expect(template).toContain('def refactor_phase(state: State)');
      expect(template).toContain('def build_tdd_workflow()');
    });

    test('should generate LLM validation workflow template', () => {
      const template = integration.generateLLMValidationWorkflow();
      
      expect(template).toContain('from burr.core import ApplicationBuilder');
      expect(template).toContain('def llm_validation_action(state: State)');
      expect(template).toContain('def build_llm_validation_workflow()');
      expect(template).toContain('validation_results');
    });

    test('should generate integration test workflow template', () => {
      const template = integration.generateIntegrationTestWorkflow();
      
      expect(template).toContain('from burr.core import ApplicationBuilder');
      expect(template).toContain('def integration_test_action(state: State)');
      expect(template).toContain('def build_integration_test_workflow()');
      expect(template).toContain('integration_results');
    });

    test('should generate performance test workflow template', () => {
      const template = integration.generatePerformanceTestWorkflow();
      
      expect(template).toContain('from burr.core import ApplicationBuilder');
      expect(template).toContain('def performance_test_action(state: State)');
      expect(template).toContain('def build_performance_test_workflow()');
      expect(template).toContain('performance_results');
    });

    test('should generate test template for workflow', () => {
      const workflow = {
        id: 'test-workflow-123',
        name: 'Test Workflow',
        description: 'A test workflow'
      };

      const template = integration.generateTestTemplate(workflow);
      
      expect(template).toContain('import pytest');
      expect(template).toContain('from burr.core import ApplicationBuilder');
      expect(template).toContain('class TestTestWorkflow:');
      expect(template).toContain('def test_workflow_initialization(self):');
      expect(template).toContain('@pytest.mark.unit');
      expect(template).toContain('@pytest.mark.burr');
      expect(template).toContain('def test_red_phase_failing_test(self):');
      expect(template).toContain('assert False, "This test should fail in Red phase"');
    });
  });

  describe('Health Status', () => {
    test('should return health status when not initialized', () => {
      const health = integration.getHealthStatus();
      
      expect(health.initialized).toBe(false);
      expect(health.active_workflows).toBe(0);
      expect(health.active_executions).toBe(0);
      expect(health.total_executions).toBe(0);
      expect(health.python_available).toBe(true);
      expect(health.pytest_available).toBe(true);
      expect(health.working_directory).toBe(testWorkingDir);
      expect(health.configuration).toBeDefined();
    });

    test('should return health status with workflows', async () => {
      await integration.createWorkingDirectoryStructure();
      await integration.initializeBurrTemplates();

      const workflowConfig = { name: 'Health Test Workflow' };
      await integration.createTDDWorkflow(workflowConfig);

      const health = integration.getHealthStatus();
      
      expect(health.active_workflows).toBe(1);
      expect(health.active_executions).toBe(0);
      expect(health.total_executions).toBe(0);
    });
  });

  describe('Execution Results', () => {
    test('should return null for non-existent execution', () => {
      const results = integration.getExecutionResults('non-existent-id');
      expect(results).toBeUndefined();
    });

    test('should calculate average cycle time', () => {
      const executions = [
        { started_at: '2023-01-01T00:00:00Z', completed_at: '2023-01-01T00:01:00Z' }, // 1 minute
        { started_at: '2023-01-01T00:02:00Z', completed_at: '2023-01-01T00:05:00Z' }, // 3 minutes
        { started_at: '2023-01-01T00:06:00Z', completed_at: '2023-01-01T00:08:00Z' }  // 2 minutes
      ];

      const avgTime = integration.calculateAverageCycleTime(executions);
      expect(avgTime).toBe(120000); // 2 minutes in milliseconds
    });

    test('should return 0 for empty executions', () => {
      const avgTime = integration.calculateAverageCycleTime([]);
      expect(avgTime).toBe(0);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully when not initialized', async () => {
      await expect(integration.shutdown()).resolves.not.toThrow();
      expect(integration.isInitialized).toBe(false);
    });

    test('should shutdown gracefully with active workflows', async () => {
      await integration.createWorkingDirectoryStructure();
      await integration.initializeBurrTemplates();

      // Create a workflow
      const workflowConfig = { name: 'Shutdown Test Workflow' };
      await integration.createTDDWorkflow(workflowConfig);

      // Simulate an active test
      integration.activeTests.set('test-execution-1', {
        execution_id: 'test-execution-1',
        workflow_id: 'test-workflow',
        status: 'running'
      });

      expect(integration.workflows.size).toBe(1);
      expect(integration.activeTests.size).toBe(1);

      await integration.shutdown();

      expect(integration.workflows.size).toBe(0);
      expect(integration.activeTests.size).toBe(0);
      expect(integration.isInitialized).toBe(false);
    });
  });

  describe('Command Execution', () => {
    test('should handle command timeout', async () => {
      const promise = integration.runCommand('sleep', ['10'], { timeout: 100 });
      
      await expect(promise).rejects.toThrow('Command timed out');
    });

    test('should handle command errors', async () => {
      const promise = integration.runCommand('nonexistent-command', []);
      
      await expect(promise).rejects.toThrow();
    });
  });
});