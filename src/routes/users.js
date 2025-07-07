const express = require('express');
const { authorize } = require('../middleware/auth');
const { validateSchema } = require('../middleware/validation');
const { userSchemas, queryParamSchemas, apiKeySchemas } = require('../middleware/validation');
const { query, transaction } = require('../../database/config/database');
const { hashPassword } = require('../middleware/auth');
const logger = require('../utils/logger');
const { trackError } = require('../utils/telemetry');
const { 
  NotFoundError, 
  ConflictError, 
  ValidationError,
  asyncHandler 
} = require('../middleware/error-handler');
const crypto = require('crypto');

const router = express.Router();

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get current user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
router.get('/profile',
  asyncHandler(async (req, res) => {
    try {
      const userResult = await query(`
        SELECT 
          id, email, full_name, role, is_active, is_verified, 
          mfa_enabled, last_login, created_at
        FROM users 
        WHERE id = $1
      `, [req.user.id]);
      
      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }
      
      const user = userResult.rows[0];
      
      // Get user statistics
      const statsResult = await query(`
        SELECT 
          COUNT(DISTINCT p.id) as project_count,
          COUNT(DISTINCT ve.id) as execution_count,
          COUNT(DISTINCT ak.id) as api_key_count
        FROM users u
        LEFT JOIN projects p ON u.id = p.owner_id AND p.is_active = true
        LEFT JOIN validation_executions ve ON u.id = ve.triggered_by
        LEFT JOIN api_keys ak ON u.id = ak.user_id AND ak.is_active = true
        WHERE u.id = $1
      `, [req.user.id]);
      
      const stats = statsResult.rows[0];
      
      res.json({
        user: {
          ...user,
          statistics: {
            project_count: parseInt(stats.project_count),
            execution_count: parseInt(stats.execution_count),
            api_key_count: parseInt(stats.api_key_count)
          }
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_user_profile',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile updated
 */
router.put('/profile',
  validateSchema(userSchemas.updateProfile),
  asyncHandler(async (req, res) => {
    const { full_name, email } = req.body;
    
    try {
      // Check if email is being changed and if it's already taken
      if (email && email !== req.user.email) {
        const existingUser = await query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [email, req.user.id]
        );
        
        if (existingUser.rows.length > 0) {
          throw new ConflictError('Email is already in use');
        }
      }
      
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;
      
      if (full_name) {
        updateFields.push(`full_name = $${paramIndex}`);
        updateValues.push(full_name);
        paramIndex++;
      }
      
      if (email) {
        updateFields.push(`email = $${paramIndex}`);
        updateValues.push(email);
        paramIndex++;
      }
      
      if (updateFields.length === 0) {
        throw new ValidationError('No fields to update');
      }
      
      updateValues.push(req.user.id);
      
      const result = await query(`
        UPDATE users 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING id, email, full_name, role, is_active, is_verified, updated_at
      `, updateValues);
      
      logger.info('User profile updated', {
        userId: req.user.id,
        fields: updateFields
      });
      
      res.json({
        message: 'Profile updated successfully',
        user: result.rows[0]
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'update_user_profile',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all users (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
router.get('/',
  authorize(['admin']),
  validateSchema(queryParamSchemas.list, 'query'),
  asyncHandler(async (req, res) => {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      role, 
      status,
      sortBy = 'created_at', 
      sortOrder = 'desc' 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    if (search) {
      whereClause += ` AND (full_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    if (role) {
      whereClause += ` AND role = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }
    
    if (status === 'active') {
      whereClause += ` AND is_active = true`;
    } else if (status === 'inactive') {
      whereClause += ` AND is_active = false`;
    }
    
    try {
      // Get total count
      const countResult = await query(`
        SELECT COUNT(*) as total FROM users ${whereClause}
      `, params);
      
      const total = parseInt(countResult.rows[0].total);
      
      // Get users
      const validSortColumns = ['full_name', 'email', 'role', 'created_at', 'last_login'];
      const orderBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
      const order = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      
      const usersResult = await query(`
        SELECT 
          u.id,
          u.email,
          u.full_name,
          u.role,
          u.is_active,
          u.is_verified,
          u.mfa_enabled,
          u.last_login,
          u.created_at,
          COUNT(DISTINCT p.id) as project_count,
          COUNT(DISTINCT ve.id) as execution_count
        FROM users u
        LEFT JOIN projects p ON u.id = p.owner_id AND p.is_active = true
        LEFT JOIN validation_executions ve ON u.id = ve.triggered_by
        ${whereClause}
        GROUP BY u.id
        ORDER BY u.${orderBy} ${order}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, limit, offset]);
      
      const users = usersResult.rows.map(user => ({
        ...user,
        project_count: parseInt(user.project_count),
        execution_count: parseInt(user.execution_count)
      }));
      
      res.json({
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_users',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update user (admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User updated
 */
router.put('/:id',
  authorize(['admin']),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { full_name, email, role, is_active } = req.body;
    
    try {
      // Check if user exists
      const userResult = await query('SELECT id FROM users WHERE id = $1', [id]);
      
      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }
      
      // Check if email is being changed and if it's already taken
      if (email) {
        const existingUser = await query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [email, id]
        );
        
        if (existingUser.rows.length > 0) {
          throw new ConflictError('Email is already in use');
        }
      }
      
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;
      
      if (full_name) {
        updateFields.push(`full_name = $${paramIndex}`);
        updateValues.push(full_name);
        paramIndex++;
      }
      
      if (email) {
        updateFields.push(`email = $${paramIndex}`);
        updateValues.push(email);
        paramIndex++;
      }
      
      if (role) {
        updateFields.push(`role = $${paramIndex}`);
        updateValues.push(role);
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
        UPDATE users 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING id, email, full_name, role, is_active, is_verified, updated_at
      `, updateValues);
      
      logger.info('User updated by admin', {
        updatedUserId: id,
        adminUserId: req.user.id,
        fields: updateFields
      });
      
      res.json({
        message: 'User updated successfully',
        user: result.rows[0]
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'update_user',
        userId: req.user.id,
        targetUserId: id
      });
      throw error;
    }
  })
);

// ============================================================================
// API KEYS MANAGEMENT
// ============================================================================

/**
 * @swagger
 * /api/users/api-keys:
 *   get:
 *     summary: Get user's API keys
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of API keys
 */
router.get('/api-keys',
  asyncHandler(async (req, res) => {
    try {
      const keysResult = await query(`
        SELECT 
          id, key_name, key_prefix, permissions, is_active, 
          last_used, expires_at, created_at
        FROM api_keys 
        WHERE user_id = $1 
        ORDER BY created_at DESC
      `, [req.user.id]);
      
      res.json({
        api_keys: keysResult.rows
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'get_api_keys',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/users/api-keys:
 *   post:
 *     summary: Create API key
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: API key created
 */
router.post('/api-keys',
  validateSchema(apiKeySchemas.create),
  asyncHandler(async (req, res) => {
    const { key_name, permissions = {}, expires_at } = req.body;
    
    try {
      // Generate API key
      const apiKey = `llm_${crypto.randomBytes(16).toString('hex')}`;
      const keyPrefix = apiKey.substring(0, 10);
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      
      const result = await transaction(async (client) => {
        const keyResult = await client.query(`
          INSERT INTO api_keys 
          (user_id, key_name, key_hash, key_prefix, permissions, expires_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, key_name, key_prefix, permissions, is_active, expires_at, created_at
        `, [req.user.id, key_name, keyHash, keyPrefix, permissions, expires_at]);
        
        return keyResult.rows[0];
      });
      
      logger.info('API key created', {
        keyId: result.id,
        keyName: key_name,
        userId: req.user.id
      });
      
      res.status(201).json({
        message: 'API key created successfully',
        api_key: apiKey, // Return the full key only once
        key_info: result
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'create_api_key',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/users/api-keys/{id}:
 *   delete:
 *     summary: Delete API key
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API key deleted
 */
router.delete('/api-keys/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    
    try {
      const result = await query(
        'DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, req.user.id]
      );
      
      if (result.rows.length === 0) {
        throw new NotFoundError('API key not found');
      }
      
      logger.info('API key deleted', {
        keyId: id,
        userId: req.user.id
      });
      
      res.json({
        message: 'API key deleted successfully'
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'delete_api_key',
        userId: req.user.id,
        keyId: id
      });
      throw error;
    }
  })
);

module.exports = router;