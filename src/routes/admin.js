const express = require('express');
const { query } = require('../../database/config/database');
const logger = require('../utils/logger');
const { trackError } = require('../utils/telemetry');
const { asyncHandler } = require('../middleware/error-handler');

const router = express.Router();

/**
 * @swagger
 * /api/admin/stats:
 *   get:
 *     summary: Get admin statistics
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin statistics
 */
router.get('/stats',
  asyncHandler(async (req, res) => {
    try {
      const statsResult = await query(`
        SELECT 
          COUNT(DISTINCT u.id) as total_users,
          COUNT(DISTINCT CASE WHEN u.is_active THEN u.id END) as active_users,
          COUNT(DISTINCT p.id) as total_projects,
          COUNT(DISTINCT ve.id) as total_executions,
          COUNT(DISTINCT CASE WHEN ve.created_at >= NOW() - INTERVAL '24 hours' THEN ve.id END) as executions_last_24h
        FROM users u
        LEFT JOIN projects p ON u.id = p.owner_id AND p.is_active = true
        LEFT JOIN validation_suites vs ON p.id = vs.project_id
        LEFT JOIN validation_executions ve ON vs.id = ve.validation_suite_id
      `);
      
      const stats = statsResult.rows[0];
      
      res.json({
        system_stats: {
          total_users: parseInt(stats.total_users),
          active_users: parseInt(stats.active_users),
          total_projects: parseInt(stats.total_projects),
          total_executions: parseInt(stats.total_executions),
          executions_last_24h: parseInt(stats.executions_last_24h)
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_admin_stats',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/admin/audit-log:
 *   get:
 *     summary: Get audit log
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Audit log entries
 */
router.get('/audit-log',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 50, action, user_id } = req.query;
    const offset = (page - 1) * limit;
    
    try {
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 1;
      
      if (action) {
        whereClause += ` AND action = $${paramIndex}`;
        params.push(action);
        paramIndex++;
      }
      
      if (user_id) {
        whereClause += ` AND user_id = $${paramIndex}`;
        params.push(user_id);
        paramIndex++;
      }
      
      const auditResult = await query(`
        SELECT 
          al.*,
          u.full_name as user_name,
          u.email as user_email
        FROM audit_log al
        LEFT JOIN users u ON al.user_id = u.id
        ${whereClause}
        ORDER BY al.timestamp DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, limit, offset]);
      
      res.json({
        audit_entries: auditResult.rows,
        pagination: {
          page,
          limit,
          total: auditResult.rows.length
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_audit_log',
        userId: req.user.id
      });
      throw error;
    }
  })
);

module.exports = router;