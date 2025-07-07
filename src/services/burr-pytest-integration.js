const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

/**
 * Burr+pytest Integration for TDD Workflows
 * Combines Burr state machine framework with pytest for test-driven development
 */
class BurrPytestIntegration {
  constructor() {
    this.isInitialized = false;
    this.config = {
      pythonPath: process.env.PYTHON_PATH || 'python3',
      pytestPath: process.env.PYTEST_PATH || 'pytest',
      burrPath: process.env.BURR_PATH || 'burr',
      workingDirectory: process.env.BURR_WORKING_DIR || path.join(__dirname, '../../python-tests'),
      testPattern: process.env.PYTEST_PATTERN || 'test_*.py',
      maxConcurrency: parseInt(process.env.PYTEST_MAX_CONCURRENCY) || 4,
      timeout: parseInt(process.env.PYTEST_TIMEOUT) || 300000, // 5 minutes
      coverage: {
        enabled: process.env.PYTEST_COVERAGE === 'true',
        threshold: parseInt(process.env.PYTEST_COVERAGE_THRESHOLD) || 80,
        reportPath: process.env.PYTEST_COVERAGE_REPORT || 'coverage-report'
      }
    };
    this.activeTests = new Map();
    this.testResults = new Map();
    this.stateTransitions = new Map();
    this.workflows = new Map();
  }

  /**
   * Initialize Burr+pytest integration
   */
  async initialize() {
    try {
      logger.info('Initializing Burr+pytest integration for TDD workflows');

      // Verify Python and pytest installation
      await this.verifyPythonEnvironment();

      // Create working directory structure
      await this.createWorkingDirectoryStructure();

      // Initialize Burr state machine templates
      await this.initializeBurrTemplates();

      // Setup pytest configuration
      await this.setupPytestConfiguration();

      this.isInitialized = true;
      logger.info('Burr+pytest integration initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Burr+pytest integration:', error);
      throw error;
    }
  }

  /**
   * Verify Python environment setup
   */
  async verifyPythonEnvironment() {
    try {
      // Check Python version
      const pythonVersion = await this.runCommand(this.config.pythonPath, ['--version']);
      logger.info('Python version:', pythonVersion);

      // Check pytest installation
      const pytestVersion = await this.runCommand(this.config.pytestPath, ['--version']);
      logger.info('pytest version:', pytestVersion);

      // Check if Burr is available (optional dependency)
      try {
        await this.runCommand(this.config.pythonPath, ['-c', 'import burr; print("Burr available")']);
        logger.info('Burr framework is available');
      } catch (error) {
        logger.warn('Burr framework not available, using fallback implementation');
      }
    } catch (error) {
      logger.error('Python environment verification failed:', error);
      throw new Error('Python environment setup incomplete. Please ensure Python 3.7+ and pytest are installed.');
    }
  }

  /**
   * Create working directory structure
   */
  async createWorkingDirectoryStructure() {
    const directories = [
      this.config.workingDirectory,
      path.join(this.config.workingDirectory, 'tests'),
      path.join(this.config.workingDirectory, 'fixtures'),
      path.join(this.config.workingDirectory, 'workflows'),
      path.join(this.config.workingDirectory, 'state-machines'),
      path.join(this.config.workingDirectory, 'reports')
    ];

    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        logger.debug('Created directory:', dir);
      }
    }
  }

  /**
   * Initialize Burr state machine templates
   */
  async initializeBurrTemplates() {
    const templates = {
      'basic-tdd-workflow.py': this.generateBasicTDDWorkflow(),
      'llm-validation-workflow.py': this.generateLLMValidationWorkflow(),
      'integration-test-workflow.py': this.generateIntegrationTestWorkflow(),
      'performance-test-workflow.py': this.generatePerformanceTestWorkflow()
    };

    const workflowsDir = path.join(this.config.workingDirectory, 'workflows');
    
    for (const [filename, content] of Object.entries(templates)) {
      const filePath = path.join(workflowsDir, filename);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, content);
        logger.debug('Created workflow template:', filename);
      }
    }
  }

  /**
   * Setup pytest configuration
   */
  async setupPytestConfiguration() {
    const pytestConfig = `
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = "${this.config.testPattern}"
python_classes = "Test*"
python_functions = "test_*"
addopts = [
    "--verbose",
    "--tb=short",
    "--strict-markers",
    "--disable-warnings",
    "--maxfail=5",
    "--tb=line",
    ${this.config.coverage.enabled ? `"--cov=.", "--cov-report=html:${this.config.coverage.reportPath}",` : ''}
]
markers = [
    "unit: Unit tests",
    "integration: Integration tests",
    "performance: Performance tests",
    "llm: LLM validation tests",
    "slow: Slow running tests",
    "burr: Burr state machine tests"
]
filterwarnings = [
    "ignore::DeprecationWarning",
    "ignore::PendingDeprecationWarning"
]
`;

    const configPath = path.join(this.config.workingDirectory, 'pyproject.toml');
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, pytestConfig);
      logger.debug('Created pytest configuration');
    }
  }

  /**
   * Create TDD workflow
   */
  async createTDDWorkflow(workflowConfig) {
    const workflowId = workflowConfig.workflow_id || uuidv4();
    const workflowName = workflowConfig.name || 'TDD Workflow';
    
    logger.info('Creating TDD workflow:', { workflowId, workflowName });

    const workflow = {
      id: workflowId,
      name: workflowName,
      description: workflowConfig.description || 'Test-Driven Development workflow',
      phases: workflowConfig.phases || ['red', 'green', 'refactor'],
      currentPhase: 'red',
      tests: [],
      stateTransitions: [],
      config: workflowConfig,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.workflows.set(workflowId, workflow);

    // Generate workflow-specific test files
    await this.generateWorkflowTests(workflow);

    return { workflow_id: workflowId, workflow };
  }

  /**
   * Execute TDD phase
   */
  async executeTDDPhase(workflowId, phase, testConfig = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    logger.info('Executing TDD phase:', { workflowId, phase });

    const execution = {
      execution_id: uuidv4(),
      workflow_id: workflowId,
      phase,
      started_at: new Date().toISOString(),
      test_config: testConfig,
      results: null,
      completed_at: null,
      status: 'running'
    };

    this.activeTests.set(execution.execution_id, execution);

    try {
      let results;
      
      switch (phase) {
        case 'red':
          results = await this.executeRedPhase(workflow, testConfig);
          break;
        case 'green':
          results = await this.executeGreenPhase(workflow, testConfig);
          break;
        case 'refactor':
          results = await this.executeRefactorPhase(workflow, testConfig);
          break;
        default:
          throw new Error(`Unknown TDD phase: ${phase}`);
      }

      execution.results = results;
      execution.completed_at = new Date().toISOString();
      execution.status = results.success ? 'passed' : 'failed';

      // Update workflow state
      workflow.currentPhase = this.getNextPhase(phase, results.success);
      workflow.updatedAt = new Date().toISOString();

      // Record state transition
      this.stateTransitions.set(execution.execution_id, {
        from: workflow.currentPhase,
        to: this.getNextPhase(phase, results.success),
        timestamp: new Date().toISOString(),
        trigger: phase,
        success: results.success
      });

      this.testResults.set(execution.execution_id, execution);
      this.activeTests.delete(execution.execution_id);

      logger.info('TDD phase execution completed:', {
        workflowId,
        phase,
        status: execution.status,
        duration: new Date() - new Date(execution.started_at)
      });

      return execution;
    } catch (error) {
      execution.status = 'error';
      execution.completed_at = new Date().toISOString();
      execution.error = error.message;
      
      this.testResults.set(execution.execution_id, execution);
      this.activeTests.delete(execution.execution_id);
      
      logger.error('TDD phase execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute Red phase (failing tests)
   */
  async executeRedPhase(workflow, testConfig) {
    logger.debug('Executing Red phase - expecting tests to fail');
    
    const testFiles = await this.getTestFiles(workflow);
    const results = await this.runPytestTests(testFiles, {
      ...testConfig,
      expectFailure: true,
      markers: ['unit', 'burr']
    });

    // In Red phase, we expect tests to fail initially
    return {
      success: results.failed > 0 && results.passed === 0,
      phase: 'red',
      test_results: results,
      message: results.failed > 0 ? 'Tests failing as expected in Red phase' : 'Warning: No failing tests found'
    };
  }

  /**
   * Execute Green phase (making tests pass)
   */
  async executeGreenPhase(workflow, testConfig) {
    logger.debug('Executing Green phase - making tests pass');
    
    const testFiles = await this.getTestFiles(workflow);
    const results = await this.runPytestTests(testFiles, {
      ...testConfig,
      expectFailure: false,
      markers: ['unit', 'burr']
    });

    return {
      success: results.passed > 0 && results.failed === 0,
      phase: 'green',
      test_results: results,
      message: results.failed === 0 ? 'All tests passing in Green phase' : 'Some tests still failing'
    };
  }

  /**
   * Execute Refactor phase (maintaining passing tests)
   */
  async executeRefactorPhase(workflow, testConfig) {
    logger.debug('Executing Refactor phase - maintaining test quality');
    
    const testFiles = await this.getTestFiles(workflow);
    const results = await this.runPytestTests(testFiles, {
      ...testConfig,
      expectFailure: false,
      markers: ['unit', 'integration', 'burr'],
      coverage: true
    });

    return {
      success: results.passed > 0 && results.failed === 0 && results.coverage >= this.config.coverage.threshold,
      phase: 'refactor',
      test_results: results,
      message: results.failed === 0 ? 'Refactoring completed successfully' : 'Tests broken during refactoring'
    };
  }

  /**
   * Run pytest tests
   */
  async runPytestTests(testFiles, options = {}) {
    const args = [
      '--json-report',
      '--json-report-file=test-results.json',
      '--tb=short',
      '--maxfail=10'
    ];

    if (options.markers) {
      args.push('-m', options.markers.join(' or '));
    }

    if (options.coverage && this.config.coverage.enabled) {
      args.push('--cov=.', `--cov-report=html:${this.config.coverage.reportPath}`);
    }

    if (options.verbose) {
      args.push('-v');
    }

    // Add test files
    if (testFiles.length > 0) {
      args.push(...testFiles);
    }

    try {
      const output = await this.runCommand(this.config.pytestPath, args, {
        cwd: this.config.workingDirectory,
        timeout: this.config.timeout
      });

      // Parse JSON results
      const resultsPath = path.join(this.config.workingDirectory, 'test-results.json');
      let results = {
        passed: 0,
        failed: 0,
        skipped: 0,
        errors: 0,
        total: 0,
        duration: 0,
        coverage: 0
      };

      if (fs.existsSync(resultsPath)) {
        try {
          const jsonResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
          results = {
            passed: jsonResults.summary?.passed || 0,
            failed: jsonResults.summary?.failed || 0,
            skipped: jsonResults.summary?.skipped || 0,
            errors: jsonResults.summary?.error || 0,
            total: jsonResults.summary?.total || 0,
            duration: jsonResults.duration || 0,
            coverage: jsonResults.coverage?.percent || 0,
            details: jsonResults.tests || []
          };
        } catch (parseError) {
          logger.warn('Failed to parse pytest JSON results:', parseError);
        }
      }

      return results;
    } catch (error) {
      logger.error('pytest execution failed:', error);
      throw new Error(`pytest execution failed: ${error.message}`);
    }
  }

  /**
   * Get test files for workflow
   */
  async getTestFiles(workflow) {
    const testsDir = path.join(this.config.workingDirectory, 'tests');
    const workflowTestDir = path.join(testsDir, workflow.id);
    
    if (!fs.existsSync(workflowTestDir)) {
      return [];
    }

    const files = fs.readdirSync(workflowTestDir)
      .filter(file => file.match(new RegExp(this.config.testPattern.replace('*', '.*'))))
      .map(file => path.join(workflowTestDir, file));

    return files;
  }

  /**
   * Generate workflow-specific test files
   */
  async generateWorkflowTests(workflow) {
    const testDir = path.join(this.config.workingDirectory, 'tests', workflow.id);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Generate basic test template
    const testTemplate = this.generateTestTemplate(workflow);
    const testPath = path.join(testDir, `test_${workflow.id}.py`);
    
    if (!fs.existsSync(testPath)) {
      fs.writeFileSync(testPath, testTemplate);
      logger.debug('Generated test file:', testPath);
    }
  }

  /**
   * Generate test template for workflow
   */
  generateTestTemplate(workflow) {
    return `
import pytest
import json
from unittest.mock import Mock, patch
from burr.core import ApplicationBuilder, State, action
from burr.core.graph import Graph

# ${workflow.name} - Generated Test Template

class Test${workflow.name.replace(/\s+/g, '')}:
    """Test class for ${workflow.name}"""
    
    def setup_method(self):
        """Setup test fixtures"""
        self.workflow_id = "${workflow.id}"
        self.workflow_name = "${workflow.name}"
        
    def test_workflow_initialization(self):
        """Test workflow initialization"""
        assert self.workflow_id is not None
        assert self.workflow_name is not None
        
    @pytest.mark.unit
    def test_red_phase_failing_test(self):
        """Test that should fail in Red phase"""
        # This test should fail initially
        assert False, "This test should fail in Red phase"
        
    @pytest.mark.unit
    @pytest.mark.burr
    def test_state_machine_transitions(self):
        """Test Burr state machine transitions"""
        # Mock state machine
        state = State({"phase": "red", "tests_passed": False})
        
        # Test transition from red to green
        assert state["phase"] == "red"
        assert state["tests_passed"] is False
        
    @pytest.mark.integration
    def test_workflow_integration(self):
        """Test workflow integration"""
        # Integration test that should pass
        assert True, "Integration test should pass"
        
    @pytest.mark.performance
    def test_workflow_performance(self):
        """Test workflow performance"""
        # Performance test
        import time
        start = time.time()
        
        # Simulate some work
        time.sleep(0.1)
        
        duration = time.time() - start
        assert duration < 1.0, "Workflow should complete within 1 second"
        
    def teardown_method(self):
        """Cleanup test fixtures"""
        pass
`;
  }

  /**
   * Generate Burr workflow templates
   */
  generateBasicTDDWorkflow() {
    return `
from burr.core import ApplicationBuilder, State, action
from burr.core.graph import Graph

@action(
    reads=["test_status", "phase"],
    writes=["test_status", "phase", "iteration"]
)
def red_phase(state: State) -> State:
    """Red phase: Write failing tests"""
    return state.update(
        phase="red",
        test_status="failing",
        iteration=state.get("iteration", 0) + 1
    )

@action(
    reads=["test_status", "phase"],
    writes=["test_status", "phase", "implementation"]
)
def green_phase(state: State) -> State:
    """Green phase: Make tests pass"""
    return state.update(
        phase="green",
        test_status="passing",
        implementation="minimal"
    )

@action(
    reads=["test_status", "phase"],
    writes=["test_status", "phase", "code_quality"]
)
def refactor_phase(state: State) -> State:
    """Refactor phase: Improve code quality"""
    return state.update(
        phase="refactor",
        test_status="passing",
        code_quality="improved"
    )

def build_tdd_workflow():
    """Build TDD workflow state machine"""
    return (
        ApplicationBuilder()
        .with_graph(
            Graph()
            .with_actions(red_phase, green_phase, refactor_phase)
            .with_transitions(
                ("red_phase", "green_phase", lambda state: state["test_status"] == "failing"),
                ("green_phase", "refactor_phase", lambda state: state["test_status"] == "passing"),
                ("refactor_phase", "red_phase", lambda state: state["code_quality"] == "improved")
            )
        )
        .with_entrypoint("red_phase")
        .with_state(State({"phase": "start", "test_status": "none", "iteration": 0}))
        .build()
    )
`;
  }

  generateLLMValidationWorkflow() {
    return `
from burr.core import ApplicationBuilder, State, action
from burr.core.graph import Graph

@action(
    reads=["validation_type", "llm_model"],
    writes=["validation_results", "metrics"]
)
def llm_validation_action(state: State) -> State:
    """LLM validation action"""
    return state.update(
        validation_results={"status": "validated", "score": 0.95},
        metrics={"accuracy": 0.95, "latency": 100}
    )

def build_llm_validation_workflow():
    """Build LLM validation workflow"""
    return (
        ApplicationBuilder()
        .with_graph(
            Graph()
            .with_actions(llm_validation_action)
        )
        .with_entrypoint("llm_validation_action")
        .with_state(State({"validation_type": "semantic", "llm_model": "claude-3-sonnet"}))
        .build()
    )
`;
  }

  generateIntegrationTestWorkflow() {
    return `
from burr.core import ApplicationBuilder, State, action
from burr.core.graph import Graph

@action(
    reads=["services", "test_data"],
    writes=["integration_results", "service_health"]
)
def integration_test_action(state: State) -> State:
    """Integration test action"""
    return state.update(
        integration_results={"status": "passed", "tests": 10},
        service_health={"status": "healthy", "uptime": "99.9%"}
    )

def build_integration_test_workflow():
    """Build integration test workflow"""
    return (
        ApplicationBuilder()
        .with_graph(
            Graph()
            .with_actions(integration_test_action)
        )
        .with_entrypoint("integration_test_action")
        .with_state(State({"services": ["api", "database"], "test_data": "sample"}))
        .build()
    )
`;
  }

  generatePerformanceTestWorkflow() {
    return `
from burr.core import ApplicationBuilder, State, action
from burr.core.graph import Graph

@action(
    reads=["load_config", "performance_thresholds"],
    writes=["performance_results", "metrics"]
)
def performance_test_action(state: State) -> State:
    """Performance test action"""
    return state.update(
        performance_results={"status": "passed", "response_time": 50},
        metrics={"throughput": 1000, "latency_p95": 100}
    )

def build_performance_test_workflow():
    """Build performance test workflow"""
    return (
        ApplicationBuilder()
        .with_graph(
            Graph()
            .with_actions(performance_test_action)
        )
        .with_entrypoint("performance_test_action")
        .with_state(State({"load_config": {"users": 100}, "performance_thresholds": {"response_time": 100}}))
        .build()
    )
`;
  }

  /**
   * Get next phase in TDD cycle
   */
  getNextPhase(currentPhase, success) {
    if (currentPhase === 'red' && success) {
      return 'green';
    } else if (currentPhase === 'green' && success) {
      return 'refactor';
    } else if (currentPhase === 'refactor' && success) {
      return 'red';
    }
    return currentPhase; // Stay in current phase if not successful
  }

  /**
   * Get workflow status
   */
  getWorkflowStatus(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return null;
    }

    const activeExecution = Array.from(this.activeTests.values())
      .find(test => test.workflow_id === workflowId);

    return {
      workflow_id: workflowId,
      name: workflow.name,
      current_phase: workflow.currentPhase,
      created_at: workflow.createdAt,
      updated_at: workflow.updatedAt,
      active_execution: activeExecution ? {
        execution_id: activeExecution.execution_id,
        phase: activeExecution.phase,
        status: activeExecution.status,
        started_at: activeExecution.started_at
      } : null,
      total_executions: Array.from(this.testResults.values())
        .filter(result => result.workflow_id === workflowId).length
    };
  }

  /**
   * Get execution results
   */
  getExecutionResults(executionId) {
    return this.testResults.get(executionId);
  }

  /**
   * Get workflow insights
   */
  getWorkflowInsights(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return null;
    }

    const executions = Array.from(this.testResults.values())
      .filter(result => result.workflow_id === workflowId);

    const phaseStats = executions.reduce((stats, exec) => {
      const phase = exec.phase;
      if (!stats[phase]) {
        stats[phase] = { total: 0, passed: 0, failed: 0, duration: 0 };
      }
      stats[phase].total++;
      if (exec.status === 'passed') stats[phase].passed++;
      if (exec.status === 'failed') stats[phase].failed++;
      if (exec.started_at && exec.completed_at) {
        stats[phase].duration += new Date(exec.completed_at) - new Date(exec.started_at);
      }
      return stats;
    }, {});

    return {
      workflow_id: workflowId,
      name: workflow.name,
      total_executions: executions.length,
      phase_statistics: phaseStats,
      success_rate: executions.length > 0 ? 
        executions.filter(e => e.status === 'passed').length / executions.length : 0,
      average_cycle_time: this.calculateAverageCycleTime(executions),
      recommendations: this.generateWorkflowRecommendations(executions)
    };
  }

  /**
   * Calculate average cycle time
   */
  calculateAverageCycleTime(executions) {
    if (executions.length === 0) return 0;
    
    const completedExecutions = executions.filter(e => e.started_at && e.completed_at);
    if (completedExecutions.length === 0) return 0;

    const totalDuration = completedExecutions.reduce((sum, exec) => 
      sum + (new Date(exec.completed_at) - new Date(exec.started_at)), 0
    );

    return totalDuration / completedExecutions.length;
  }

  /**
   * Generate workflow recommendations
   */
  generateWorkflowRecommendations(executions) {
    const recommendations = [];
    
    if (executions.length === 0) {
      recommendations.push({
        type: 'no_executions',
        message: 'No test executions found. Start with the Red phase.',
        priority: 'high'
      });
      return recommendations;
    }

    const failedExecutions = executions.filter(e => e.status === 'failed');
    const failureRate = failedExecutions.length / executions.length;

    if (failureRate > 0.3) {
      recommendations.push({
        type: 'high_failure_rate',
        message: `High failure rate detected (${Math.round(failureRate * 100)}%). Review test implementation.`,
        priority: 'high'
      });
    }

    const avgDuration = this.calculateAverageCycleTime(executions);
    if (avgDuration > 300000) { // 5 minutes
      recommendations.push({
        type: 'slow_execution',
        message: 'TDD cycles are taking too long. Consider breaking down tests.',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return {
      initialized: this.isInitialized,
      active_workflows: this.workflows.size,
      active_executions: this.activeTests.size,
      total_executions: this.testResults.size,
      python_available: this.config.pythonPath !== null,
      pytest_available: this.config.pytestPath !== null,
      working_directory: this.config.workingDirectory,
      configuration: {
        max_concurrency: this.config.maxConcurrency,
        timeout: this.config.timeout,
        coverage_enabled: this.config.coverage.enabled,
        coverage_threshold: this.config.coverage.threshold
      }
    };
  }

  /**
   * Run command utility
   */
  async runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`Command failed with code ${code}: ${stderr}`));
        }
      });

      child.on('error', (error) => {
        reject(error);
      });

      // Handle timeout
      if (options.timeout) {
        setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error('Command timed out'));
        }, options.timeout);
      }
    });
  }

  /**
   * Shutdown integration
   */
  async shutdown() {
    try {
      // Cancel active tests
      for (const [executionId, execution] of this.activeTests) {
        execution.status = 'cancelled';
        execution.completed_at = new Date().toISOString();
        this.testResults.set(executionId, execution);
      }

      this.activeTests.clear();
      this.workflows.clear();
      this.stateTransitions.clear();
      this.isInitialized = false;

      logger.info('Burr+pytest integration shutdown completed');
    } catch (error) {
      logger.error('Error during Burr+pytest integration shutdown:', error);
      throw error;
    }
  }
}

module.exports = { BurrPytestIntegration };