const express = require('express');
const { authorize } = require('../middleware/auth');
const { validateSchema } = require('../middleware/validation');
const { projectSchemas, queryParamSchemas } = require('../middleware/validation');
const { query, transaction } = require('../../database/config/database');
const logger = require('../utils/logger');
const { trackError } = require('../utils/telemetry');
const { 
  NotFoundError, 
  ConflictError,
  ValidationError,
  asyncHandler 
} = require('../middleware/error-handler');

const router = express.Router();

/**
 * @swagger
 * /api/projects:
 *   get:
 *     summary: Get user's projects
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in project name and description
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive]
 *         description: Filter by project status
 *     responses:
 *       200:
 *         description: List of projects
 */
router.get('/',
  validateSchema(queryParamSchemas.list, 'query'),
  asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      status,
      sortBy = 'created_at', 
      sortOrder = 'desc' 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    // Filter by ownership or admin access
    if (req.user.role !== 'admin') {
      whereClause += ` AND p.owner_id = $${paramIndex}`;
      params.push(req.user.id);
      paramIndex++;
    }
    
    if (search) {
      whereClause += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (status === 'active') {
      whereClause += ` AND p.is_active = true`;
    } else if (status === 'inactive') {
      whereClause += ` AND p.is_active = false`;
    }
    
    try {
      // Get total count
      const countResult = await query(`
        SELECT COUNT(*) as total 
        FROM projects p
        ${whereClause}
      `, params);
      
      const total = parseInt(countResult.rows[0].total);
      
      // Get projects with statistics
      const validSortColumns = ['name', 'created_at', 'updated_at'];
      const orderBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
      const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      
      const projectsResult = await query(`
        SELECT 
          p.*,
          u.full_name as owner_name,
          COUNT(DISTINCT vt.id) as target_count,
          COUNT(DISTINCT vs.id) as suite_count,
          COUNT(DISTINCT t.id) as test_count,
          COUNT(DISTINCT ve.id) as execution_count,
          MAX(ve.created_at) as last_execution
        FROM projects p
        JOIN users u ON p.owner_id = u.id
        LEFT JOIN validation_targets vt ON p.id = vt.project_id AND vt.is_active = true
        LEFT JOIN validation_suites vs ON p.id = vs.project_id AND vs.is_active = true
        LEFT JOIN tests t ON vs.id = t.validation_suite_id AND t.is_active = true
        LEFT JOIN validation_executions ve ON vs.id = ve.validation_suite_id
        ${whereClause}
        GROUP BY p.id, u.full_name
        ORDER BY p.${orderBy} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, limit, offset]);
      
      const projects = projectsResult.rows.map(project => ({
        ...project,
        target_count: parseInt(project.target_count),
        suite_count: parseInt(project.suite_count),
        test_count: parseInt(project.test_count),
        execution_count: parseInt(project.execution_count)
      }));
      
      res.json({
        projects,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_projects',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/projects:
 *   post:
 *     summary: Create a new project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 255
 *               description:
 *                 type: string
 *                 maxLength: 1000
 *               settings:
 *                 type: object
 *     responses:
 *       201:
 *         description: Project created successfully
 */
router.post('/',
  authorize(['admin', 'validator']),
  validateSchema(projectSchemas.create),
  asyncHandler(async (req, res) => {
    const { name, description, settings = {} } = req.body;
    
    try {
      // Check if project name already exists for the user
      const existingProject = await query(
        'SELECT id FROM projects WHERE name = $1 AND owner_id = $2',
        [name, req.user.id]
      );
      
      if (existingProject.rows.length > 0) {
        throw new ConflictError('Project with this name already exists');
      }
      
      const result = await transaction(async (client) => {
        const projectResult = await client.query(`
          INSERT INTO projects (name, description, owner_id, settings)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [name, description, req.user.id, settings]);
        
        return projectResult.rows[0];
      });
      
      logger.info('Project created', {
        projectId: result.id,
        projectName: name,
        userId: req.user.id
      });
      
      res.status(201).json({
        message: 'Project created successfully',
        project: result
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'create_project',
        userId: req.user.id,
        projectName: name
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/projects/{id}:
 *   get:
 *     summary: Get project details
 *     tags: [Projects]
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
 *         description: Project details
 */
router.get('/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      const projectResult = await query(`
        SELECT 
          p.*,
          u.full_name as owner_name,
          u.email as owner_email
        FROM projects p
        JOIN users u ON p.owner_id = u.id
        WHERE p.id = $1
      `, [id]);
      
      if (projectResult.rows.length === 0) {
        throw new NotFoundError('Project not found');
      }
      
      const project = projectResult.rows[0];
      
      // Check access
      if (project.owner_id !== req.user.id && req.user.role !== 'admin') {
        throw new NotFoundError('Project not found');
      }
      
      // Get project statistics
      const statsResult = await query(`
        SELECT 
          COUNT(DISTINCT vt.id) as target_count,
          COUNT(DISTINCT vs.id) as suite_count,
          COUNT(DISTINCT t.id) as test_count,
          COUNT(DISTINCT ve.id) as execution_count,
          COUNT(DISTINCT CASE WHEN ve.status = 'completed' THEN ve.id END) as completed_executions,
          COUNT(DISTINCT CASE WHEN ve.status = 'failed' THEN ve.id END) as failed_executions,
          MAX(ve.created_at) as last_execution
        FROM projects p
        LEFT JOIN validation_targets vt ON p.id = vt.project_id AND vt.is_active = true
        LEFT JOIN validation_suites vs ON p.id = vs.project_id AND vs.is_active = true
        LEFT JOIN tests t ON vs.id = t.validation_suite_id AND t.is_active = true
        LEFT JOIN validation_executions ve ON vs.id = ve.validation_suite_id
        WHERE p.id = $1
        GROUP BY p.id
      `, [id]);
      
      const stats = statsResult.rows[0];
      
      // Get recent executions
      const recentExecutionsResult = await query(`
        SELECT 
          ve.id,
          ve.status,
          ve.started_at,
          ve.completed_at,
          vs.name as suite_name,
          vs.type as suite_type,
          u.full_name as triggered_by_name
        FROM validation_executions ve
        JOIN validation_suites vs ON ve.validation_suite_id = vs.id
        JOIN users u ON ve.triggered_by = u.id
        WHERE vs.project_id = $1
        ORDER BY ve.created_at DESC
        LIMIT 10
      `, [id]);
      
      const recentExecutions = recentExecutionsResult.rows;
      
      res.json({
        project: {
          ...project,
          statistics: {
            target_count: parseInt(stats.target_count),
            suite_count: parseInt(stats.suite_count),
            test_count: parseInt(stats.test_count),
            execution_count: parseInt(stats.execution_count),
            completed_executions: parseInt(stats.completed_executions),
            failed_executions: parseInt(stats.failed_executions),
            success_rate: stats.execution_count > 0 ? 
              (stats.completed_executions / stats.execution_count) * 100 : 0,
            last_execution: stats.last_execution
          },
          recent_executions: recentExecutions
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_project',
        userId: req.user.id,
        projectId: id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/projects/{id}:
 *   put:
 *     summary: Update project
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               settings:
 *                 type: object
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Project updated successfully
 */
router.put('/:id',
  validateSchema(projectSchemas.update),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, description, settings, is_active } = req.body;
    
    try {
      // Check if project exists and user has access
      const projectResult = await query(
        'SELECT id, owner_id, name FROM projects WHERE id = $1',
        [id]
      );
      
      if (projectResult.rows.length === 0) {
        throw new NotFoundError('Project not found');
      }
      
      const project = projectResult.rows[0];
      
      if (project.owner_id !== req.user.id && req.user.role !== 'admin') {
        throw new NotFoundError('Project not found');
      }
      
      // Check if name is being changed and if it conflicts
      if (name && name !== project.name) {
        const nameConflict = await query(
          'SELECT id FROM projects WHERE name = $1 AND owner_id = $2 AND id != $3',
          [name, project.owner_id, id]
        );
        
        if (nameConflict.rows.length > 0) {
          throw new ConflictError('Project with this name already exists');
        }
      }
      
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;
      
      if (name) {
        updateFields.push(`name = $${paramIndex}`);
        updateValues.push(name);
        paramIndex++;
      }
      
      if (description !== undefined) {
        updateFields.push(`description = $${paramIndex}`);
        updateValues.push(description);
        paramIndex++;
      }
      
      if (settings) {
        updateFields.push(`settings = $${paramIndex}`);
        updateValues.push(settings);
        paramIndex++;
      }
      
      if (typeof is_active === 'boolean') {
        updateFields.push(`is_active = $${paramIndex}`);
        updateValues.push(is_active);
        paramIndex++;
      }
      
      if (updateFields.length === 0) {
        throw new ValidationError('No fields to update');
      }
      
      updateValues.push(id);
      
      const result = await query(`
        UPDATE projects 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `, updateValues);
      
      logger.info('Project updated', {
        projectId: id,
        userId: req.user.id,
        fields: updateFields
      });
      
      res.json({
        message: 'Project updated successfully',
        project: result.rows[0]
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'update_project',
        userId: req.user.id,
        projectId: id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/projects/{id}:
 *   delete:
 *     summary: Delete project
 *     tags: [Projects]
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
 *         description: Project deleted successfully
 */
router.delete('/:id',
  authorize(['admin', 'validator']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      // Check if project exists and user has access
      const projectResult = await query(
        'SELECT id, owner_id, name FROM projects WHERE id = $1',
        [id]
      );
      
      if (projectResult.rows.length === 0) {
        throw new NotFoundError('Project not found');
      }
      
      const project = projectResult.rows[0];
      
      if (project.owner_id !== req.user.id && req.user.role !== 'admin') {
        throw new NotFoundError('Project not found');
      }
      
      // Check if project has any executions in progress
      const activeExecutionsResult = await query(`
        SELECT COUNT(*) as count
        FROM validation_executions ve
        JOIN validation_suites vs ON ve.validation_suite_id = vs.id
        WHERE vs.project_id = $1 AND ve.status IN ('pending', 'running')
      `, [id]);
      
      const activeExecutions = parseInt(activeExecutionsResult.rows[0].count);
      
      if (activeExecutions > 0) {
        throw new ConflictError('Cannot delete project with active validation executions');
      }
      
      // Soft delete by deactivating
      await transaction(async (client) => {
        // Deactivate project
        await client.query(
          'UPDATE projects SET is_active = false, updated_at = NOW() WHERE id = $1',
          [id]
        );
        
        // Deactivate related entities
        await client.query(
          'UPDATE validation_targets SET is_active = false WHERE project_id = $1',
          [id]
        );
        
        await client.query(
          'UPDATE validation_suites SET is_active = false WHERE project_id = $1',
          [id]
        );
        
        await client.query(`
          UPDATE tests SET is_active = false 
          WHERE validation_suite_id IN (
            SELECT id FROM validation_suites WHERE project_id = $1
          )
        `, [id]);
      });
      
      logger.info('Project deleted (deactivated)', {
        projectId: id,
        projectName: project.name,
        userId: req.user.id
      });
      
      res.json({
        message: 'Project deleted successfully'
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'delete_project',
        userId: req.user.id,
        projectId: id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/projects/{id}/dashboard:
 *   get:
 *     summary: Get project dashboard data
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days for metrics
 *     responses:
 *       200:
 *         description: Project dashboard data
 */
router.get('/:id/dashboard',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { days = 30 } = req.query;
    
    try {
      // Check project access
      const projectResult = await query(
        'SELECT owner_id FROM projects WHERE id = $1',
        [id]
      );
      
      if (projectResult.rows.length === 0) {
        throw new NotFoundError('Project not found');
      }
      
      const project = projectResult.rows[0];
      
      if (project.owner_id !== req.user.id && req.user.role !== 'admin') {
        throw new NotFoundError('Project not found');
      }
      
      // Get execution metrics for the specified period
      const metricsResult = await query(`
        SELECT 
          DATE(ve.created_at) as date,
          COUNT(*) as total_executions,
          COUNT(CASE WHEN ve.status = 'completed' THEN 1 END) as completed_executions,
          COUNT(CASE WHEN ve.status = 'failed' THEN 1 END) as failed_executions,
          AVG(EXTRACT(EPOCH FROM (ve.completed_at - ve.started_at))) as avg_duration
        FROM validation_executions ve
        JOIN validation_suites vs ON ve.validation_suite_id = vs.id
        WHERE vs.project_id = $1 
          AND ve.created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY DATE(ve.created_at)
        ORDER BY date ASC
      `, [id]);
      
      // Get test success rates by type
      const testTypeMetricsResult = await query(`
        SELECT 
          vt.type as target_type,
          COUNT(vr.id) as total_tests,
          COUNT(CASE WHEN vr.status = 'passed' THEN 1 END) as passed_tests,
          AVG(vr.score) as avg_score
        FROM validation_results vr
        JOIN tests t ON vr.test_id = t.id
        JOIN validation_targets vt ON t.validation_target_id = vt.id
        JOIN validation_executions ve ON vr.validation_execution_id = ve.id
        JOIN validation_suites vs ON ve.validation_suite_id = vs.id
        WHERE vs.project_id = $1 
          AND vr.created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY vt.type
        ORDER BY total_tests DESC
      `, [id]);
      
      // Get top failing tests
      const failingTestsResult = await query(`
        SELECT 
          t.name as test_name,
          vt.name as target_name,
          vt.type as target_type,
          COUNT(vr.id) as total_runs,
          COUNT(CASE WHEN vr.status = 'failed' THEN 1 END) as failed_runs,
          (COUNT(CASE WHEN vr.status = 'failed' THEN 1 END)::float / COUNT(vr.id) * 100) as failure_rate
        FROM validation_results vr
        JOIN tests t ON vr.test_id = t.id
        JOIN validation_targets vt ON t.validation_target_id = vt.id
        JOIN validation_executions ve ON vr.validation_execution_id = ve.id
        JOIN validation_suites vs ON ve.validation_suite_id = vs.id
        WHERE vs.project_id = $1 
          AND vr.created_at >= NOW() - INTERVAL '${days} days'
        GROUP BY t.id, t.name, vt.name, vt.type
        HAVING COUNT(vr.id) >= 5 
        ORDER BY failure_rate DESC
        LIMIT 10
      `, [id]);
      
      const dashboard = {
        execution_metrics: metricsResult.rows,
        test_type_metrics: testTypeMetricsResult.rows.map(row => ({
          ...row,
          total_tests: parseInt(row.total_tests),
          passed_tests: parseInt(row.passed_tests),
          success_rate: row.total_tests > 0 ? 
            (row.passed_tests / row.total_tests) * 100 : 0,
          avg_score: parseFloat(row.avg_score) || 0
        })),
        failing_tests: failingTestsResult.rows.map(row => ({
          ...row,
          total_runs: parseInt(row.total_runs),
          failed_runs: parseInt(row.failed_runs),
          failure_rate: parseFloat(row.failure_rate)
        })),
        period: {
          days: parseInt(days),
          start_date: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
          end_date: new Date().toISOString()
        }
      };
      
      res.json({ dashboard });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_project_dashboard',
        userId: req.user.id,
        projectId: id
      });
      throw error;
    }
  })
);

module.exports = router;