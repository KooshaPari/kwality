const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../../database/config/database');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '7d';

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Generate refresh token
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

// Hash password
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

// Compare password
const comparePassword = async (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'];
    
    if (!authHeader && !apiKey) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token or API key provided'
      });
    }
    
    let user;
    
    // Check API key authentication
    if (apiKey) {
      const hashedKey = require('crypto').createHash('sha256').update(apiKey).digest('hex');
      
      const apiKeyResult = await query(`
        SELECT ak.*, u.id as user_id, u.email, u.full_name, u.role, u.is_active
        FROM api_keys ak
        JOIN users u ON ak.user_id = u.id
        WHERE ak.key_hash = $1 AND ak.is_active = TRUE AND u.is_active = TRUE
        AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
      `, [hashedKey]);
      
      if (apiKeyResult.rows.length === 0) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid API key'
        });
      }
      
      user = apiKeyResult.rows[0];
      
      // Update last_used timestamp
      await query(
        'UPDATE api_keys SET last_used = NOW() WHERE id = $1',
        [user.id]
      );
      
      req.user = {
        id: user.user_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        auth_method: 'api_key',
        permissions: user.permissions
      };
    }
    // Check JWT authentication
    else if (authHeader) {
      const token = authHeader.split(' ')[1];
      
      if (!token) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'No token provided'
        });
      }
      
      const decoded = verifyToken(token);
      
      // Check if user exists and is active
      const userResult = await query(
        'SELECT id, email, full_name, role, is_active FROM users WHERE id = $1',
        [decoded.userId]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User not found'
        });
      }
      
      user = userResult.rows[0];
      
      if (!user.is_active) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'User account is inactive'
        });
      }
      
      req.user = {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        auth_method: 'jwt'
      };
    }
    
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.message === 'Invalid token' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token'
      });
    }
    
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Authentication failed'
    });
  }
};

// Authorization middleware
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }
    
    // If no roles specified, just check if user is authenticated
    if (roles.length === 0) {
      return next();
    }
    
    // Check if user has required role
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions'
      });
    }
    
    next();
  };
};

// Optional authentication middleware (doesn't fail if no auth)
const optionalAuth = async (req, res, next) => {
  try {
    await authenticate(req, res, () => {});
  } catch (error) {
    // Continue without authentication
  }
  next();
};

// Session management
const createSession = async (userId, sessionData = {}) => {
  const sessionToken = require('crypto').randomBytes(32).toString('hex');
  const refreshToken = require('crypto').randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  await query(`
    INSERT INTO user_sessions (user_id, session_token, refresh_token, expires_at, ip_address, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    userId,
    sessionToken,
    refreshToken,
    expiresAt,
    sessionData.ip_address || null,
    sessionData.user_agent || null
  ]);
  
  return { sessionToken, refreshToken, expiresAt };
};

// Invalidate session
const invalidateSession = async (sessionToken) => {
  await query('DELETE FROM user_sessions WHERE session_token = $1', [sessionToken]);
};

// Clean expired sessions
const cleanExpiredSessions = async () => {
  const result = await query('DELETE FROM user_sessions WHERE expires_at < NOW()');
  return result.rowCount;
};

// Rate limiting by user
const rateLimitByUser = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();
  
  return (req, res, next) => {
    if (!req.user) {
      return next();
    }
    
    const userId = req.user.id;
    const now = Date.now();
    
    if (!userRequests.has(userId)) {
      userRequests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    const userLimit = userRequests.get(userId);
    
    if (now > userLimit.resetTime) {
      userRequests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (userLimit.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'User rate limit exceeded',
        resetTime: new Date(userLimit.resetTime).toISOString()
      });
    }
    
    userLimit.count++;
    next();
  };
};

// MFA token generation and verification
const generateMFASecret = () => {
  const speakeasy = require('speakeasy');
  return speakeasy.generateSecret({
    name: 'LLM Validation Platform',
    length: 20
  });
};

const verifyMFAToken = (token, secret) => {
  const speakeasy = require('speakeasy');
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token,
    window: 2
  });
};

// Audit logging middleware
const auditLog = (action) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the action after response
      setImmediate(async () => {
        try {
          const success = res.statusCode >= 200 && res.statusCode < 300;
          
          await query(`
            INSERT INTO audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent, old_values, new_values)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            req.user?.id || null,
            action,
            req.route?.path || req.path,
            req.params?.id || null,
            req.ip,
            req.get('User-Agent'),
            success ? null : JSON.stringify({ error: 'Request failed' }),
            success ? JSON.stringify({ success: true }) : null
          ]);
        } catch (error) {
          logger.error('Audit log error:', error);
        }
      });
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  generateToken,
  generateRefreshToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticate,
  authorize,
  optionalAuth,
  createSession,
  invalidateSession,
  cleanExpiredSessions,
  rateLimitByUser,
  generateMFASecret,
  verifyMFAToken,
  auditLog
};
