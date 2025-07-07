const express = require('express');
const { body, param, validationResult } = require('express-validator');
const PlaywrightMCPServer = require('../services/playwright-mcp-server');
const PlaywrightMCPTools = require('../services/playwright-mcp-tools');
const PlaywrightConfig = require('../services/playwright-config');
const logger = require('../utils/logger');
const { trackError } = require('../utils/telemetry');

const router = express.Router();

// Initialize services
let mcpServer = null;
let mcpTools = null;
let mcpConfig = null;

// Initialize MCP services
const initializeMCP = async () => {
  if (mcpServer) return;
  
  try {
    mcpConfig = new PlaywrightConfig();
    await mcpConfig.initialize();
    
    if (!mcpConfig.isEnabled()) {
      logger.warn('Playwright MCP is disabled in configuration');
      return;
    }
    
    mcpServer = new PlaywrightMCPServer();
    await mcpServer.initialize();
    
    mcpTools = new PlaywrightMCPTools(mcpServer);
    
    logger.info('MCP services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize MCP services:', error);
    throw error;
  }
};

// Middleware to ensure MCP is initialized
const ensureMCPInitialized = async (req, res, next) => {
  try {
    await initializeMCP();
    if (!mcpServer) {
      return res.status(503).json({
        error: 'MCP services not available',
        message: 'Playwright MCP is disabled or failed to initialize'
      });
    }
    next();
  } catch (error) {
    logger.error('MCP initialization failed:', error);
    return res.status(503).json({
      error: 'MCP initialization failed',
      message: error.message
    });
  }
};

// Error handling middleware
const handleMCPError = (error, req, res, next) => {
  logger.error('MCP route error:', error);
  trackError(error, { route: req.route?.path, method: req.method });
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: error.message,
      details: error.errors || []
    });
  }
  
  return res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
};

/**
 * @swagger
 * /api/mcp/status:
 *   get:
 *     summary: Get MCP server status
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: MCP server status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 health:
 *                   type: object
 *                 config:
 *                   type: object
 */
router.get('/status', ensureMCPInitialized, async (req, res) => {
  try {
    const health = await mcpServer.getHealthStatus();
    const config = mcpConfig.getMCPConfig();
    
    res.json({
      status: 'active',
      health,
      config: {
        enabled: config.enabled,
        port: config.port,
        host: config.host,
        tools: config.tools
      },
      capabilities: mcpServer.getCapabilities()
    });
  } catch (error) {
    handleMCPError(error, req, res);
  }
});

/**
 * @swagger
 * /api/mcp/tools:
 *   get:
 *     summary: List available MCP tools
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: List of available tools
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tools:
 *                   type: array
 */
router.get('/tools', ensureMCPInitialized, async (req, res) => {
  try {
    const tools = mcpTools.getToolList();
    res.json({ tools });
  } catch (error) {
    handleMCPError(error, req, res);
  }
});

/**
 * @swagger
 * /api/mcp/tools/{toolName}/schema:
 *   get:
 *     summary: Get tool schema
 *     tags: [MCP]
 *     parameters:
 *       - in: path
 *         name: toolName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tool schema
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/tools/:toolName/schema', ensureMCPInitialized, async (req, res) => {
  try {
    const { toolName } = req.params;
    const schema = mcpTools.getToolSchema(toolName);
    res.json({ schema });
  } catch (error) {
    handleMCPError(error, req, res);
  }
});

/**
 * @swagger
 * /api/mcp/execute:
 *   post:
 *     summary: Execute MCP tool
 *     tags: [MCP]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tool:
 *                 type: string
 *               args:
 *                 type: object
 *     responses:
 *       200:
 *         description: Tool execution result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post('/execute', [
  ensureMCPInitialized,
  body('tool').isString().notEmpty().withMessage('Tool name is required'),
  body('args').isObject().withMessage('Args must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }
    
    const { tool, args } = req.body;
    
    // Check if tool is enabled
    if (!mcpConfig.isToolEnabled(tool)) {
      return res.status(403).json({
        error: 'Tool Disabled',
        message: `Tool ${tool} is not enabled`
      });
    }
    
    // Validate arguments
    mcpTools.validateArgs(tool, args);
    
    // Execute tool
    const result = await mcpTools.executeTool(tool, args);
    
    res.json({
      success: true,
      result,
      tool,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleMCPError(error, req, res);
  }
});

/**
 * @swagger
 * /api/mcp/contexts:
 *   get:
 *     summary: List active browser contexts
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: List of active contexts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 contexts:
 *                   type: array
 */
router.get('/contexts', ensureMCPInitialized, async (req, res) => {
  try {
    const contexts = mcpServer.listContexts();
    res.json({ contexts });
  } catch (error) {
    handleMCPError(error, req, res);
  }
});

/**
 * @swagger
 * /api/mcp/pages:
 *   get:
 *     summary: List active pages
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: List of active pages
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pages:
 *                   type: array
 */
router.get('/pages', ensureMCPInitialized, async (req, res) => {
  try {
    const pages = mcpServer.listPages();
    res.json({ pages });
  } catch (error) {
    handleMCPError(error, req, res);
  }
});

/**
 * @swagger
 * /api/mcp/config:
 *   get:
 *     summary: Get MCP configuration
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: MCP configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/config', ensureMCPInitialized, async (req, res) => {
  try {
    const config = mcpConfig.getConfig();
    res.json({ config });
  } catch (error) {
    handleMCPError(error, req, res);
  }
});

/**
 * @swagger
 * /api/mcp/config:
 *   put:
 *     summary: Update MCP configuration
 *     tags: [MCP]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Configuration updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.put('/config', [
  ensureMCPInitialized,
  body('config').isObject().withMessage('Config must be an object')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        details: errors.array()
      });
    }
    
    const { config } = req.body;
    await mcpConfig.updateConfig(config);
    
    res.json({
      success: true,
      message: 'Configuration updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleMCPError(error, req, res);
  }
});

/**
 * @swagger
 * /api/mcp/cleanup:
 *   post:
 *     summary: Clean up MCP resources
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: Cleanup completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post('/cleanup', ensureMCPInitialized, async (req, res) => {
  try {
    await mcpServer.cleanup();
    res.json({
      success: true,
      message: 'MCP resources cleaned up successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleMCPError(error, req, res);
  }
});

/**
 * @swagger
 * /api/mcp/health:
 *   get:
 *     summary: Get detailed health check
 *     tags: [MCP]
 *     responses:
 *       200:
 *         description: Health check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/health', ensureMCPInitialized, async (req, res) => {
  try {
    const health = await mcpServer.getHealthStatus();
    const resourceLimits = mcpConfig.getResourceLimits();
    
    res.json({
      health,
      resourceLimits,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    handleMCPError(error, req, res);
  }
});

// Initialize MCP services on module load
initializeMCP().catch(error => {
  logger.error('Failed to initialize MCP services during startup:', error);
});

module.exports = router;