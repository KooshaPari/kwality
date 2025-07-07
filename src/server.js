const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { createServer } = require('http');
const { WebSocketServer } = require('ws');
const { initializeConnections, closeConnections } = require('../database/config/database');
const logger = require('./utils/logger');
const { initializeMetrics } = require('./utils/metrics');
const { initializeTelemetry } = require('./utils/telemetry');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const projectRoutes = require('./routes/projects');
const validationRoutes = require('./routes/validation');
const knowledgeGraphRoutes = require('./routes/knowledge-graph');
const metricsRoutes = require('./routes/metrics');
const healthRoutes = require('./routes/health');
const adminRoutes = require('./routes/admin');
const mcpRoutes = require('./routes/mcp');

// Import middleware
const { authenticate, authorize } = require('./middleware/auth');
const { errorHandler } = require('./middleware/error-handler');
const { requestLogger } = require('./middleware/request-logger');
const { validateRequest } = require('./middleware/validation');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Initialize telemetry and metrics
initializeTelemetry();
const metricsRegistry = initializeMetrics();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true,
  optionsSuccessStatus: 200
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use('/api/auth', authLimiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) }
}));
app.use(requestLogger);

// Swagger documentation
const swaggerOptions = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'LLM Validation Platform API',
      version: '1.0.0',
      description: 'Comprehensive LLM validation platform with TDD-like validation, auto-grading, and multi-interface support',
      contact: {
        name: 'LLM Validation Platform Team',
        email: 'support@llm-validation.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_BASE_URL || `http://localhost:${PORT}`,
        description: 'LLM Validation Platform API Server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        },
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key'
        }
      }
    },
    security: [
      { bearerAuth: [] },
      { apiKey: [] }
    ]
  },
  apis: ['./src/routes/*.js', './src/models/*.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/projects', authenticate, projectRoutes);
app.use('/api/validation', authenticate, validationRoutes);
app.use('/api/knowledge-graph', authenticate, knowledgeGraphRoutes);
app.use('/api/metrics', authenticate, metricsRoutes);
app.use('/api/admin', authenticate, authorize(['admin']), adminRoutes);
app.use('/api/mcp', authenticate, mcpRoutes);
app.use('/health', healthRoutes);

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    res.set('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
  } catch (error) {
    res.status(500).end();
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'LLM Validation Platform API',
    version: '1.0.0',
    environment: NODE_ENV,
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      docs: '/api-docs',
      metrics: '/metrics'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Create HTTP server
const server = createServer(app);

// WebSocket server setup
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  logger.info('WebSocket connection established');
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to LLM Validation Platform WebSocket',
    timestamp: new Date().toISOString()
  }));
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'subscribe':
          // Handle subscription to validation updates
          ws.validationId = data.validationId;
          logger.info(`WebSocket subscribed to validation ${data.validationId}`);
          break;
          
        case 'unsubscribe':
          // Handle unsubscription
          delete ws.validationId;
          logger.info('WebSocket unsubscribed from validation updates');
          break;
          
        case 'ping':
          // Handle ping for connection health
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;
          
        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${data.type}`,
            timestamp: new Date().toISOString()
          }));
      }
    } catch (error) {
      logger.error('WebSocket message error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format',
        timestamp: new Date().toISOString()
      }));
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket connection closed');
  });
  
  ws.on('error', (error) => {
    logger.error('WebSocket error:', error);
  });
});

// Broadcast validation updates to WebSocket clients
const broadcastValidationUpdate = (validationId, update) => {
  wss.clients.forEach((client) => {
    if (client.readyState === 1 && client.validationId === validationId) {
      client.send(JSON.stringify({
        type: 'validation_update',
        validationId,
        update,
        timestamp: new Date().toISOString()
      }));
    }
  });
};

// Make broadcast function available globally
app.set('broadcastValidationUpdate', broadcastValidationUpdate);

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  // Close HTTP server
  server.close(() => {
    logger.info('HTTP server closed');
  });
  
  // Close WebSocket server
  wss.close(() => {
    logger.info('WebSocket server closed');
  });
  
  // Close database connections
  await closeConnections();
  
  logger.info('Graceful shutdown completed');
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const startServer = async () => {
  try {
    // Initialize database connections
    await initializeConnections();
    
    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`LLM Validation Platform API server started on port ${PORT}`);
      logger.info(`Environment: ${NODE_ENV}`);
      logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
      logger.info(`Health Check: http://localhost:${PORT}/health`);
      logger.info(`Metrics: http://localhost:${PORT}/metrics`);
      
      if (NODE_ENV === 'development') {
        logger.info('Server is running in development mode');
      }
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;
