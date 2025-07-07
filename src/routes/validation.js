const express = require('express');
const { authorize } = require('../middleware/auth');
const { validateSchema } = require('../middleware/validation');
const { 
  validationTargetSchemas, 
  validationSuiteSchemas, 
  testSchemas,
  validationExecutionSchemas,
  queryParamSchemas
} = require('../middleware/validation');
const { query, transaction } = require('../../database/config/database');
const logger = require('../utils/logger');
const { trackError, traceValidationExecution } = require('../utils/telemetry');
const { recordValidationExecution } = require('../utils/metrics');
const { 
  ValidationError, 
  NotFoundError, 
  ConflictError,
  asyncHandler 
} = require('../middleware/error-handler');

const router = express.Router();

// ============================================================================
// VALIDATION TARGETS
// ============================================================================

/**
 * @swagger
 * /api/validation/targets:
 *   get:
 *     summary: Get validation targets
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: project_id
 *         schema:
 *           type: string
 *         description: Filter by project ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [llm_model, code_function, api_endpoint, data_pipeline, ui_component]
 *         description: Filter by target type
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         description: Items per page
 *     responses:
 *       200:
 *         description: List of validation targets
 */
router.get('/targets',
  validateSchema(queryParamSchemas.list, 'query'),
  asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 10, 
      project_id, 
      type, 
      sortBy = 'created_at', 
      sortOrder = 'desc' 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (project_id) {
      whereClause += ` AND project_id = $${paramIndex}`;
      params.push(project_id);
      paramIndex++;
    }
    
    if (type) {
      whereClause += ` AND type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }
    
    const validSortColumns = ['name', 'type', 'created_at', 'updated_at'];
    const orderBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    
    try {
      // Get total count
      const countResult = await query(`
        SELECT COUNT(*) as total
        FROM validation_targets vt
        JOIN projects p ON vt.project_id = p.id
        ${whereClause}
      `, params);
      
      const total = parseInt(countResult.rows[0].total);
      
      // Get targets
      const targetsResult = await query(`
        SELECT 
          vt.id,
          vt.name,
          vt.description,
          vt.type,
          vt.configuration,
          vt.metadata,
          vt.is_active,
          vt.created_at,
          vt.updated_at,
          p.name as project_name,
          p.id as project_id
        FROM validation_targets vt
        JOIN projects p ON vt.project_id = p.id
        ${whereClause}
        ORDER BY vt.${orderBy} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, limit, offset]);
      
      const targets = targetsResult.rows;
      
      res.json({
        targets,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_validation_targets',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/validation/targets:
 *   post:
 *     summary: Create validation target
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - project_id
 *               - name
 *               - type
 *               - configuration
 *             properties:
 *               project_id:
 *                 type: string
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [llm_model, code_function, api_endpoint, data_pipeline, ui_component]
 *               configuration:
 *                 type: object
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Validation target created
 */
router.post('/targets',
  authorize(['admin', 'validator']),
  validateSchema(validationTargetSchemas.create),
  asyncHandler(async (req, res) => {
    const { project_id, name, description, type, configuration, metadata = {} } = req.body;
    
    try {
      // Check if project exists and user has access
      const projectResult = await query(
        'SELECT id, owner_id FROM projects WHERE id = $1 AND is_active = true',
        [project_id]
      );
      
      if (projectResult.rows.length === 0) {
        throw new NotFoundError('Project not found or inactive');
      }
      
      const project = projectResult.rows[0];
      
      // Check if user has access to the project
      if (project.owner_id !== req.user.id && req.user.role !== 'admin') {
        throw new NotFoundError('Project not found');
      }
      
      // Create validation target
      const result = await transaction(async (client) => {
        const targetResult = await client.query(`
          INSERT INTO validation_targets 
          (project_id, name, description, type, configuration, metadata)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `, [project_id, name, description, type, configuration, metadata]);
        
        return targetResult.rows[0];
      });
      
      logger.info('Validation target created', {
        targetId: result.id,
        projectId: project_id,
        userId: req.user.id,
        type: type
      });
      
      res.status(201).json({
        message: 'Validation target created successfully',
        target: result
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'create_validation_target',
        userId: req.user.id,
        projectId: project_id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/validation/targets/{id}:
 *   get:
 *     summary: Get validation target by ID
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Validation target details
 */
router.get('/targets/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      const result = await query(`
        SELECT 
          vt.*,
          p.name as project_name,
          p.owner_id as project_owner_id,
          COUNT(t.id) as test_count
        FROM validation_targets vt
        JOIN projects p ON vt.project_id = p.id
        LEFT JOIN tests t ON vt.id = t.validation_target_id AND t.is_active = true
        WHERE vt.id = $1
        GROUP BY vt.id, p.name, p.owner_id
      `, [id]);
      
      if (result.rows.length === 0) {
        throw new NotFoundError('Validation target not found');
      }
      
      const target = result.rows[0];
      
      // Check access
      if (target.project_owner_id !== req.user.id && req.user.role !== 'admin') {
        throw new NotFoundError('Validation target not found');
      }
      
      res.json({ target });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_validation_target',
        userId: req.user.id,
        targetId: id
      });
      throw error;
    }
  })
);

// ============================================================================
// VALIDATION SUITES
// ============================================================================

/**
 * @swagger
 * /api/validation/suites:
 *   get:
 *     summary: Get validation suites
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of validation suites
 */
router.get('/suites',
  validateSchema(queryParamSchemas.list, 'query'),
  asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 10, 
      project_id, 
      type, 
      sortBy = 'created_at', 
      sortOrder = 'desc' 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (project_id) {
      whereClause += ` AND vs.project_id = $${paramIndex}`;
      params.push(project_id);
      paramIndex++;
    }
    
    if (type) {
      whereClause += ` AND vs.type = $${paramIndex}`;
      params.push(type);
      paramIndex++;
    }
    
    try {
      const suitesResult = await query(`
        SELECT 
          vs.*,
          p.name as project_name,
          COUNT(t.id) as test_count
        FROM validation_suites vs
        JOIN projects p ON vs.project_id = p.id
        LEFT JOIN tests t ON vs.id = t.validation_suite_id AND t.is_active = true
        ${whereClause}
        GROUP BY vs.id, p.name
        ORDER BY vs.${sortBy} ${sortOrder.toUpperCase()}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, limit, offset]);
      
      res.json({
        suites: suitesResult.rows,
        pagination: {
          page,
          limit,
          total: suitesResult.rows.length
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_validation_suites',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/validation/suites:
 *   post:
 *     summary: Create validation suite
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Validation suite created
 */
router.post('/suites',
  authorize(['admin', 'validator']),
  validateSchema(validationSuiteSchemas.create),
  asyncHandler(async (req, res) => {
    const { project_id, name, description, type, configuration = {} } = req.body;
    
    try {
      // Check project access
      const projectResult = await query(
        'SELECT id, owner_id FROM projects WHERE id = $1 AND is_active = true',
        [project_id]
      );
      
      if (projectResult.rows.length === 0) {
        throw new NotFoundError('Project not found or inactive');
      }
      
      const project = projectResult.rows[0];
      
      if (project.owner_id !== req.user.id && req.user.role !== 'admin') {
        throw new NotFoundError('Project not found');
      }
      
      const result = await transaction(async (client) => {
        const suiteResult = await client.query(`
          INSERT INTO validation_suites 
          (project_id, name, description, type, configuration)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING *
        `, [project_id, name, description, type, configuration]);
        
        return suiteResult.rows[0];
      });
      
      logger.info('Validation suite created', {
        suiteId: result.id,
        projectId: project_id,
        userId: req.user.id,
        type: type
      });
      
      res.status(201).json({
        message: 'Validation suite created successfully',
        suite: result
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'create_validation_suite',
        userId: req.user.id,
        projectId: project_id
      });
      throw error;
    }
  })
);

// ============================================================================
// TESTS
// ============================================================================

/**
 * @swagger
 * /api/validation/tests:
 *   post:
 *     summary: Create test
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Test created
 */
router.post('/tests',
  authorize(['admin', 'validator']),
  validateSchema(testSchemas.create),
  asyncHandler(async (req, res) => {
    const { 
      validation_suite_id, 
      validation_target_id, 
      name, 
      description, 
      test_definition, 
      expected_result,
      priority = 'medium',
      timeout_seconds = 300,
      retry_count = 0
    } = req.body;
    
    try {
      // Verify suite and target exist and user has access
      const verificationResult = await query(`
        SELECT 
          vs.id as suite_id,
          vt.id as target_id,
          p.owner_id
        FROM validation_suites vs
        JOIN validation_targets vt ON vs.project_id = vt.project_id
        JOIN projects p ON vs.project_id = p.id
        WHERE vs.id = $1 AND vt.id = $2 AND vs.is_active = true AND vt.is_active = true
      `, [validation_suite_id, validation_target_id]);
      
      if (verificationResult.rows.length === 0) {
        throw new ValidationError('Invalid suite or target, or they belong to different projects');
      }
      
      const verification = verificationResult.rows[0];
      
      if (verification.owner_id !== req.user.id && req.user.role !== 'admin') {
        throw new NotFoundError('Resource not found');
      }
      
      const result = await transaction(async (client) => {
        const testResult = await client.query(`
          INSERT INTO tests 
          (validation_suite_id, validation_target_id, name, description, 
           test_definition, expected_result, priority, timeout_seconds, retry_count)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `, [
          validation_suite_id, validation_target_id, name, description,
          test_definition, expected_result, priority, timeout_seconds, retry_count
        ]);
        
        return testResult.rows[0];
      });
      
      logger.info('Test created', {
        testId: result.id,
        suiteId: validation_suite_id,
        targetId: validation_target_id,
        userId: req.user.id
      });
      
      res.status(201).json({
        message: 'Test created successfully',
        test: result
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'create_test',
        userId: req.user.id,
        suiteId: validation_suite_id,
        targetId: validation_target_id
      });
      throw error;
    }
  })
);

// ============================================================================
// VALIDATION EXECUTIONS
// ============================================================================

/**
 * @swagger
 * /api/validation/execute:
 *   post:
 *     summary: Execute validation suite
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       202:
 *         description: Validation execution started
 */
router.post('/execute',
  authorize(['admin', 'validator', 'grader']),
  validateSchema(validationExecutionSchemas.create),
  asyncHandler(async (req, res) => {
    const { 
      validation_suite_id, 
      configuration = {}, 
      environment = 'development' 
    } = req.body;
    
    try {
      // Verify suite exists and user has access
      const suiteResult = await query(`
        SELECT 
          vs.*,
          p.owner_id,
          COUNT(t.id) as test_count
        FROM validation_suites vs
        JOIN projects p ON vs.project_id = p.id
        LEFT JOIN tests t ON vs.id = t.validation_suite_id AND t.is_active = true
        WHERE vs.id = $1 AND vs.is_active = true
        GROUP BY vs.id, p.owner_id
      `, [validation_suite_id]);
      
      if (suiteResult.rows.length === 0) {
        throw new NotFoundError('Validation suite not found or inactive');
      }
      
      const suite = suiteResult.rows[0];
      
      if (suite.owner_id !== req.user.id && req.user.role !== 'admin') {
        throw new NotFoundError('Validation suite not found');
      }
      
      if (suite.test_count === 0) {
        throw new ValidationError('Cannot execute suite with no active tests');
      }
      
      // Create execution record
      const executionResult = await traceValidationExecution(
        validation_suite_id,
        suite.type,
        async () => {
          const execution = await transaction(async (client) => {
            const execResult = await client.query(`
              INSERT INTO validation_executions 
              (validation_suite_id, triggered_by, status, configuration, environment)
              VALUES ($1, $2, 'pending', $3, $4)
              RETURNING *
            `, [validation_suite_id, req.user.id, configuration, environment]);
            
            return execResult.rows[0];
          });
          
          // Queue individual test executions
          await queueTestExecutions(execution.id, validation_suite_id);
          
          return {
            status: 'started',
            execution_id: execution.id,
            suite_id: validation_suite_id,
            test_count: suite.test_count
          };
        }
      );
      
      // Record metrics
      recordValidationExecution(
        suite.type,
        'started',
        0,
        req.user.id
      );
      
      logger.info('Validation execution started', {
        executionId: executionResult.execution_id,
        suiteId: validation_suite_id,
        userId: req.user.id,
        testCount: suite.test_count
      });
      
      res.status(202).json({
        message: 'Validation execution started',
        execution: {
          id: executionResult.execution_id,
          suite_id: validation_suite_id,
          status: 'pending',
          test_count: suite.test_count,
          environment: environment,
          created_at: new Date().toISOString()
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'execute_validation',
        userId: req.user.id,
        suiteId: validation_suite_id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/validation/executions/{id}:
 *   get:
 *     summary: Get validation execution results
 *     tags: [Validation]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Validation execution results
 */
router.get('/executions/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      // Get execution details
      const executionResult = await query(`
        SELECT 
          ve.*,
          vs.name as suite_name,
          vs.type as suite_type,
          p.owner_id,
          u.full_name as triggered_by_name
        FROM validation_executions ve
        JOIN validation_suites vs ON ve.validation_suite_id = vs.id
        JOIN projects p ON vs.project_id = p.id
        JOIN users u ON ve.triggered_by = u.id
        WHERE ve.id = $1
      `, [id]);
      
      if (executionResult.rows.length === 0) {
        throw new NotFoundError('Validation execution not found');
      }
      
      const execution = executionResult.rows[0];
      
      // Check access
      if (execution.owner_id !== req.user.id && req.user.role !== 'admin') {
        throw new NotFoundError('Validation execution not found');
      }
      
      // Get test results
      const resultsQuery = await query(`
        SELECT 
          vr.*,
          t.name as test_name,
          t.priority,
          vt.name as target_name,
          vt.type as target_type
        FROM validation_results vr
        JOIN tests t ON vr.test_id = t.id
        JOIN validation_targets vt ON t.validation_target_id = vt.id
        WHERE vr.validation_execution_id = $1
        ORDER BY vr.created_at ASC
      `, [id]);
      
      const results = resultsQuery.rows;
      
      // Calculate summary
      const summary = results.reduce((acc, result) => {
        acc.total++;
        acc[result.status] = (acc[result.status] || 0) + 1;
        if (result.score !== null) {
          acc.totalScore += result.score;
          acc.maxPossibleScore += result.max_score || 100;
        }
        return acc;
      }, { 
        total: 0, 
        passed: 0, 
        failed: 0, 
        error: 0, 
        pending: 0, 
        running: 0,
        totalScore: 0,
        maxPossibleScore: 0
      });
      
      summary.successRate = summary.total > 0 ? (summary.passed / summary.total) * 100 : 0;
      summary.averageScore = summary.maxPossibleScore > 0 ? 
        (summary.totalScore / summary.maxPossibleScore) * 100 : 0;
      
      res.json({
        execution: {
          ...execution,
          summary,
          results
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_validation_execution',
        userId: req.user.id,
        executionId: id
      });
      throw error;
    }
  })
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const queueTestExecutions = async (executionId, suiteId) => {
  try {
    // Get all active tests for the suite
    const testsResult = await query(`
      SELECT id, name, test_definition, expected_result, priority, timeout_seconds, retry_count
      FROM tests 
      WHERE validation_suite_id = $1 AND is_active = true
      ORDER BY priority DESC, created_at ASC
    `, [suiteId]);
    
    const tests = testsResult.rows;
    
    // Create validation result records
    for (const test of tests) {
      await query(`
        INSERT INTO validation_results 
        (validation_execution_id, test_id, status)
        VALUES ($1, $2, 'pending')
      `, [executionId, test.id]);
    }
    
    // Update execution status
    await query(
      'UPDATE validation_executions SET status = $1, started_at = NOW() WHERE id = $2',
      ['running', executionId]
    );
    
    // Here you would typically queue the tests for actual execution
    // For now, we'll simulate immediate execution
    await simulateTestExecution(executionId, tests);
    
  } catch (error) {
    logger.error('Failed to queue test executions', {
      executionId,
      suiteId,
      error: error.message
    });
    
    // Mark execution as failed
    await query(
      'UPDATE validation_executions SET status = $1, completed_at = NOW() WHERE id = $2',
      ['failed', executionId]
    );
    
    throw error;
  }
};

const simulateTestExecution = async (executionId, tests) => {
  // This is a simplified simulation - in production, this would integrate with
  // actual validation engines like DeepEval, Playwright, etc.
  
  for (const test of tests) {
    try {
      const startTime = Date.now();
      
      // Simulate test execution delay
      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      // Simulate random test results
      const isSuccess = Math.random() > 0.2; // 80% success rate
      const score = isSuccess ? Math.random() * 40 + 60 : Math.random() * 40; // 60-100 for pass, 0-40 for fail
      
      const status = isSuccess ? 'passed' : 'failed';
      const resultData = {
        test_type: test.test_definition.type || 'generic',
        execution_details: {
          started_at: new Date(startTime).toISOString(),
          completed_at: new Date(endTime).toISOString(),
          execution_time_ms: executionTime
        },
        metrics: {
          accuracy: isSuccess ? 0.9 + Math.random() * 0.1 : Math.random() * 0.6,
          performance: Math.random(),
          reliability: isSuccess ? 0.8 + Math.random() * 0.2 : Math.random() * 0.7
        }
      };
      
      // Update test result
      await query(`
        UPDATE validation_results 
        SET status = $1, score = $2, max_score = 100, started_at = $3, 
            completed_at = $4, execution_time_ms = $5, result_data = $6
        WHERE validation_execution_id = $7 AND test_id = $8
      `, [
        status, score, new Date(startTime), new Date(endTime), 
        executionTime, resultData, executionId, test.id
      ]);
      
      logger.info('Test executed', {
        executionId,
        testId: test.id,
        status,
        score,
        executionTime
      });
      
    } catch (error) {
      logger.error('Test execution failed', {
        executionId,
        testId: test.id,
        error: error.message
      });
      
      // Mark test as error
      await query(`
        UPDATE validation_results 
        SET status = 'error', error_message = $1, completed_at = NOW()
        WHERE validation_execution_id = $2 AND test_id = $3
      `, [error.message, executionId, test.id]);
    }
  }
  
  // Mark execution as completed
  await query(
    'UPDATE validation_executions SET status = $1, completed_at = NOW() WHERE id = $2',
    ['completed', executionId]
  );
  
  logger.info('Validation execution completed', { executionId });
};

module.exports = router;