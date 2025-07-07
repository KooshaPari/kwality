const express = require('express');
const { 
  generateToken, 
  generateRefreshToken, 
  verifyToken, 
  hashPassword, 
  comparePassword,
  authenticate,
  createSession,
  invalidateSession,
  generateMFASecret,
  verifyMFAToken,
  auditLog
} = require('../middleware/auth');
const { validateSchema } = require('../middleware/validation');
const { userSchemas } = require('../middleware/validation');
const { query, transaction } = require('../../database/config/database');
const logger = require('../utils/logger');
const { trackError } = require('../utils/telemetry');
const { 
  ValidationError, 
  AuthenticationError, 
  ConflictError, 
  NotFoundError,
  asyncHandler 
} = require('../middleware/error-handler');

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - full_name
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *               full_name:
 *                 type: string
 *                 minLength: 2
 *               role:
 *                 type: string
 *                 enum: [admin, validator, grader, viewer]
 *                 default: viewer
 *     responses:
 *       201:
 *         description: User registered successfully
 *       400:
 *         description: Validation error
 *       409:
 *         description: User already exists
 */
router.post('/register', 
  validateSchema(userSchemas.register),
  auditLog('user_registration'),
  asyncHandler(async (req, res) => {
    const { email, password, full_name, role = 'viewer' } = req.body;
    
    try {
      // Check if user already exists
      const existingUser = await query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );
      
      if (existingUser.rows.length > 0) {
        throw new ConflictError('User with this email already exists');
      }
      
      // Hash password
      const passwordHash = await hashPassword(password);
      
      // Create user in transaction
      const result = await transaction(async (client) => {
        const userResult = await client.query(`
          INSERT INTO users (email, password_hash, full_name, role, is_active, is_verified)
          VALUES ($1, $2, $3, $4, true, false)
          RETURNING id, email, full_name, role, is_active, is_verified, created_at
        `, [email, passwordHash, full_name, role]);
        
        return userResult.rows[0];
      });
      
      // Generate tokens
      const accessToken = generateToken({ 
        userId: result.id, 
        email: result.email, 
        role: result.role 
      });
      
      const refreshToken = generateRefreshToken({ 
        userId: result.id, 
        email: result.email 
      });
      
      // Create session
      const session = await createSession(result.id, {
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });
      
      logger.info('User registered successfully', {
        userId: result.id,
        email: result.email,
        role: result.role
      });
      
      res.status(201).json({
        message: 'User registered successfully',
        user: {
          id: result.id,
          email: result.email,
          full_name: result.full_name,
          role: result.role,
          is_active: result.is_active,
          is_verified: result.is_verified,
          created_at: result.created_at
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'Bearer',
          expires_in: process.env.JWT_EXPIRES_IN || '15m'
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'user_registration',
        email: email
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Authenticate user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               mfa_token:
 *                 type: string
 *                 description: MFA token (if MFA is enabled)
 *     responses:
 *       200:
 *         description: Login successful
 *       401:
 *         description: Invalid credentials
 *       423:
 *         description: MFA required
 */
router.post('/login',
  validateSchema(userSchemas.login),
  auditLog('user_login'),
  asyncHandler(async (req, res) => {
    const { email, password, mfa_token } = req.body;
    
    try {
      // Get user
      const userResult = await query(`
        SELECT id, email, password_hash, full_name, role, is_active, is_verified, 
               mfa_enabled, mfa_secret, last_login
        FROM users 
        WHERE email = $1
      `, [email]);
      
      if (userResult.rows.length === 0) {
        throw new AuthenticationError('Invalid email or password');
      }
      
      const user = userResult.rows[0];
      
      // Check if user is active
      if (!user.is_active) {
        throw new AuthenticationError('Account is disabled');
      }
      
      // Verify password
      const isPasswordValid = await comparePassword(password, user.password_hash);
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid email or password');
      }
      
      // Check MFA if enabled
      if (user.mfa_enabled && user.mfa_secret) {
        if (!mfa_token) {
          return res.status(423).json({
            error: 'MFA Required',
            message: 'Multi-factor authentication token required',
            mfa_required: true
          });
        }
        
        const isMFAValid = verifyMFAToken(mfa_token, user.mfa_secret);
        if (!isMFAValid) {
          throw new AuthenticationError('Invalid MFA token');
        }
      }
      
      // Generate tokens
      const accessToken = generateToken({ 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      });
      
      const refreshToken = generateRefreshToken({ 
        userId: user.id, 
        email: user.email 
      });
      
      // Create session
      const session = await createSession(user.id, {
        ip_address: req.ip,
        user_agent: req.get('User-Agent')
      });
      
      // Update last login
      await query(
        'UPDATE users SET last_login = NOW() WHERE id = $1',
        [user.id]
      );
      
      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
        role: user.role
      });
      
      res.json({
        message: 'Login successful',
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          is_active: user.is_active,
          is_verified: user.is_verified,
          mfa_enabled: user.mfa_enabled,
          last_login: user.last_login
        },
        tokens: {
          access_token: accessToken,
          refresh_token: refreshToken,
          token_type: 'Bearer',
          expires_in: process.env.JWT_EXPIRES_IN || '15m'
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'user_login',
        email: email
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/auth/refresh:
 *   post:
 *     summary: Refresh access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refresh_token
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *       401:
 *         description: Invalid refresh token
 */
router.post('/refresh',
  asyncHandler(async (req, res) => {
    const { refresh_token } = req.body;
    
    if (!refresh_token) {
      throw new ValidationError('Refresh token is required');
    }
    
    try {
      // Verify refresh token
      const decoded = verifyToken(refresh_token);
      
      // Get user
      const userResult = await query(
        'SELECT id, email, role, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (userResult.rows.length === 0) {
        throw new AuthenticationError('User not found');
      }
      
      const user = userResult.rows[0];
      
      if (!user.is_active) {
        throw new AuthenticationError('Account is disabled');
      }
      
      // Generate new access token
      const accessToken = generateToken({ 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      });
      
      logger.info('Token refreshed successfully', {
        userId: user.id,
        email: user.email
      });
      
      res.json({
        message: 'Token refreshed successfully',
        tokens: {
          access_token: accessToken,
          token_type: 'Bearer',
          expires_in: process.env.JWT_EXPIRES_IN || '15m'
        }
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'token_refresh'
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Logout user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logout successful
 *       401:
 *         description: Not authenticated
 */
router.post('/logout',
  authenticate,
  auditLog('user_logout'),
  asyncHandler(async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader) {
        const token = authHeader.split(' ')[1];
        
        // In a production environment, you might want to add the token to a blacklist
        // For now, we'll just invalidate any sessions
        await query(
          'DELETE FROM user_sessions WHERE user_id = $1',
          [req.user.id]
        );
      }
      
      logger.info('User logged out successfully', {
        userId: req.user.id,
        email: req.user.email
      });
      
      res.json({
        message: 'Logout successful'
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'user_logout',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/auth/verify:
 *   get:
 *     summary: Verify current token
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token is valid
 *       401:
 *         description: Invalid token
 */
router.get('/verify',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({
      message: 'Token is valid',
      user: {
        id: req.user.id,
        email: req.user.email,
        full_name: req.user.full_name,
        role: req.user.role,
        auth_method: req.user.auth_method
      }
    });
  })
);

/**
 * @swagger
 * /api/auth/mfa/setup:
 *   post:
 *     summary: Setup MFA for user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: MFA setup initiated
 *       401:
 *         description: Not authenticated
 */
router.post('/mfa/setup',
  authenticate,
  auditLog('mfa_setup'),
  asyncHandler(async (req, res) => {
    try {
      const secret = generateMFASecret();
      
      // Store secret temporarily (not activated until verified)
      await query(
        'UPDATE users SET mfa_secret = $1 WHERE id = $2',
        [secret.base32, req.user.id]
      );
      
      const qrcode = require('qrcode');
      const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
      
      logger.info('MFA setup initiated', {
        userId: req.user.id,
        email: req.user.email
      });
      
      res.json({
        message: 'MFA setup initiated',
        secret: secret.base32,
        qr_code: qrCodeUrl,
        manual_entry_key: secret.base32,
        backup_codes: [] // In production, generate backup codes
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'mfa_setup',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/auth/mfa/verify:
 *   post:
 *     summary: Verify and activate MFA
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 description: MFA token from authenticator app
 *     responses:
 *       200:
 *         description: MFA activated successfully
 *       400:
 *         description: Invalid MFA token
 */
router.post('/mfa/verify',
  authenticate,
  auditLog('mfa_verification'),
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    
    if (!token) {
      throw new ValidationError('MFA token is required');
    }
    
    try {
      // Get user's MFA secret
      const userResult = await query(
        'SELECT mfa_secret FROM users WHERE id = $1',
        [req.user.id]
      );
      
      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }
      
      const mfaSecret = userResult.rows[0].mfa_secret;
      
      if (!mfaSecret) {
        throw new ValidationError('MFA not set up. Please set up MFA first.');
      }
      
      // Verify token
      const isValid = verifyMFAToken(token, mfaSecret);
      
      if (!isValid) {
        throw new ValidationError('Invalid MFA token');
      }
      
      // Activate MFA
      await query(
        'UPDATE users SET mfa_enabled = true WHERE id = $1',
        [req.user.id]
      );
      
      logger.info('MFA activated successfully', {
        userId: req.user.id,
        email: req.user.email
      });
      
      res.json({
        message: 'MFA activated successfully',
        mfa_enabled: true
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'mfa_verification',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/auth/mfa/disable:
 *   post:
 *     summary: Disable MFA for user
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *               mfa_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: MFA disabled successfully
 *       401:
 *         description: Invalid credentials
 */
router.post('/mfa/disable',
  authenticate,
  auditLog('mfa_disable'),
  asyncHandler(async (req, res) => {
    const { password, mfa_token } = req.body;
    
    if (!password) {
      throw new ValidationError('Password is required');
    }
    
    try {
      // Get user with password hash and MFA secret
      const userResult = await query(
        'SELECT password_hash, mfa_secret, mfa_enabled FROM users WHERE id = $1',
        [req.user.id]
      );
      
      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }
      
      const user = userResult.rows[0];
      
      // Verify password
      const isPasswordValid = await comparePassword(password, user.password_hash);
      if (!isPasswordValid) {
        throw new AuthenticationError('Invalid password');
      }
      
      // Verify MFA token if MFA is currently enabled
      if (user.mfa_enabled && user.mfa_secret) {
        if (!mfa_token) {
          throw new ValidationError('MFA token is required');
        }
        
        const isMFAValid = verifyMFAToken(mfa_token, user.mfa_secret);
        if (!isMFAValid) {
          throw new AuthenticationError('Invalid MFA token');
        }
      }
      
      // Disable MFA
      await query(
        'UPDATE users SET mfa_enabled = false, mfa_secret = NULL WHERE id = $1',
        [req.user.id]
      );
      
      logger.info('MFA disabled successfully', {
        userId: req.user.id,
        email: req.user.email
      });
      
      res.json({
        message: 'MFA disabled successfully',
        mfa_enabled: false
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'mfa_disable',
        userId: req.user.id
      });
      throw error;
    }
  })
);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - current_password
 *               - new_password
 *             properties:
 *               current_password:
 *                 type: string
 *               new_password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       401:
 *         description: Invalid current password
 */
router.post('/change-password',
  authenticate,
  validateSchema(userSchemas.changePassword),
  auditLog('password_change'),
  asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;
    
    try {
      // Get user's current password hash
      const userResult = await query(
        'SELECT password_hash FROM users WHERE id = $1',
        [req.user.id]
      );
      
      if (userResult.rows.length === 0) {
        throw new NotFoundError('User not found');
      }
      
      const user = userResult.rows[0];
      
      // Verify current password
      const isCurrentPasswordValid = await comparePassword(current_password, user.password_hash);
      if (!isCurrentPasswordValid) {
        throw new AuthenticationError('Invalid current password');
      }
      
      // Hash new password
      const newPasswordHash = await hashPassword(new_password);
      
      // Update password
      await query(
        'UPDATE users SET password_hash = $1 WHERE id = $2',
        [newPasswordHash, req.user.id]
      );
      
      // Invalidate all sessions (force re-login)
      await query(
        'DELETE FROM user_sessions WHERE user_id = $1',
        [req.user.id]
      );
      
      logger.info('Password changed successfully', {
        userId: req.user.id,
        email: req.user.email
      });
      
      res.json({
        message: 'Password changed successfully. Please log in again.',
        require_reauth: true
      });
      
    } catch (error) {
      trackError(error, {
        operation: 'password_change',
        userId: req.user.id
      });
      throw error;
    }
  })
);

module.exports = router;