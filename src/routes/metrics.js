const express = require('express');
const { authorize } = require('../middleware/auth');
const { query } = require('../../database/config/database');
const logger = require('../utils/logger');
const { trackError } = require('../utils/telemetry');
const { asyncHandler } = require('../middleware/error-handler');

const router = express.Router();

/**
 * @swagger
 * /api/metrics/overview:
 *   get:
 *     summary: Get system metrics overview
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: System metrics overview
 */
router.get('/overview',
  asyncHandler(async (req, res) => {
    try {
      const metricsResult = await query(`
        SELECT 
          COUNT(DISTINCT p.id) as total_projects,
          COUNT(DISTINCT vt.id) as total_targets,
          COUNT(DISTINCT vs.id) as total_suites,
          COUNT(DISTINCT t.id) as total_tests,
          COUNT(DISTINCT ve.id) as total_executions,
          COUNT(DISTINCT CASE WHEN ve.status = 'completed' THEN ve.id END) as completed_executions
        FROM projects p
        LEFT JOIN validation_targets vt ON p.id = vt.project_id AND vt.is_active = true
        LEFT JOIN validation_suites vs ON p.id = vs.project_id AND vs.is_active = true
        LEFT JOIN tests t ON vs.id = t.validation_suite_id AND t.is_active = true
        LEFT JOIN validation_executions ve ON vs.id = ve.validation_suite_id
        WHERE p.is_active = true
      `);
      
      const metrics = metricsResult.rows[0];
      
      res.json({
        overview: {
          total_projects: parseInt(metrics.total_projects),
          total_targets: parseInt(metrics.total_targets),
          total_suites: parseInt(metrics.total_suites),
          total_tests: parseInt(metrics.total_tests),
          total_executions: parseInt(metrics.total_executions),
          completed_executions: parseInt(metrics.completed_executions),
          success_rate: metrics.total_executions > 0 ? 
            (metrics.completed_executions / metrics.total_executions) * 100 : 0
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_metrics_overview',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/metrics/performance:
 *   get:
 *     summary: Get performance metrics
 *     tags: [Metrics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance metrics
 */
router.get('/performance',
  authorize(['admin']),
  asyncHandler(async (req, res) => {
    const { days = 7 } = req.query;
    
    try {
      const performanceResult = await query(`
        SELECT 
          metric_name,
          AVG(metric_value) as avg_value,
          MIN(metric_value) as min_value,
          MAX(metric_value) as max_value,
          COUNT(*) as sample_count
        FROM metrics
        WHERE timestamp >= NOW() - INTERVAL '${days} days'
          AND metric_type = 'performance'
        GROUP BY metric_name
        ORDER BY avg_value DESC
      `);
      
      res.json({
        performance_metrics: performanceResult.rows,
        period_days: parseInt(days)
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_performance_metrics',
        userId: req.user.id
      });
      throw error;
    }
  })
);

module.exports = router;