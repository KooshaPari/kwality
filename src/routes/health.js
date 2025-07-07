const express = require('express');
const { getHealthStatus } = require('../../database/config/database');
const { traceHealthCheck } = require('../utils/telemetry');
const logger = require('../utils/logger');

const router = express.Router();

// Basic health check
router.get('/', async (req, res) => {
  try {
    const healthStatus = await traceHealthCheck('basic', async () => {
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      };
    });
    
    res.json(healthStatus);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Detailed health check with dependencies
router.get('/detailed', async (req, res) => {
  try {
    const healthStatus = await traceHealthCheck('detailed', async () => {
      const startTime = Date.now();
      
      // Check database connectivity
      const dbHealth = await getHealthStatus();
      
      // Check system resources
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Calculate response time
      const responseTime = Date.now() - startTime;
      
      const overallHealthy = dbHealth.overall === 'healthy';
      
      return {
        status: overallHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        responseTime: `${responseTime}ms`,
        dependencies: {
          database: dbHealth,
        },
        system: {
          memory: {
            rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
            external: `${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
          loadAverage: process.platform !== 'win32' ? process.loadavg() : null,
        },
        endpoints: {
          api: '/api',
          docs: '/api-docs',
          metrics: '/metrics',
          health: '/health',
        },
      };
    });
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Liveness probe (for Kubernetes)
router.get('/live', async (req, res) => {
  try {
    const healthStatus = await traceHealthCheck('liveness', async () => {
      return {
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        pid: process.pid,
      };
    });
    
    res.json(healthStatus);
  } catch (error) {
    logger.error('Liveness check failed:', error);
    res.status(503).json({
      status: 'dead',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Readiness probe (for Kubernetes)
router.get('/ready', async (req, res) => {
  try {
    const healthStatus = await traceHealthCheck('readiness', async () => {
      const startTime = Date.now();
      
      // Check if all critical dependencies are ready
      const dbHealth = await getHealthStatus();
      
      const responseTime = Date.now() - startTime;
      const ready = dbHealth.postgresql.status === 'healthy' && 
                    dbHealth.redis.status === 'healthy';
      
      return {
        status: ready ? 'ready' : 'not_ready',
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        checks: {
          database: dbHealth.postgresql.status === 'healthy',
          cache: dbHealth.redis.status === 'healthy',
          knowledgeGraph: dbHealth.neo4j.status === 'healthy',
        },
      };
    });
    
    const statusCode = healthStatus.status === 'ready' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Startup probe (for Kubernetes)
router.get('/startup', async (req, res) => {
  try {
    const healthStatus = await traceHealthCheck('startup', async () => {
      const startTime = Date.now();
      
      // Check if the application has started successfully
      const dbHealth = await getHealthStatus();
      
      const responseTime = Date.now() - startTime;
      const started = dbHealth.postgresql.status === 'healthy' && 
                     process.uptime() > 10; // At least 10 seconds uptime
      
      return {
        status: started ? 'started' : 'starting',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        responseTime: `${responseTime}ms`,
        checks: {
          database: dbHealth.postgresql.status === 'healthy',
          uptime: process.uptime() > 10,
        },
      };
    });
    
    const statusCode = healthStatus.status === 'started' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    logger.error('Startup check failed:', error);
    res.status(503).json({
      status: 'starting',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Database-specific health check
router.get('/database', async (req, res) => {
  try {
    const healthStatus = await traceHealthCheck('database', async () => {
      const dbHealth = await getHealthStatus();
      
      return {
        status: dbHealth.overall === 'healthy' ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        databases: dbHealth,
      };
    });
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    logger.error('Database health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// System metrics health check
router.get('/metrics', async (req, res) => {
  try {
    const healthStatus = await traceHealthCheck('metrics', async () => {
      const memoryUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Calculate health based on resource usage
      const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      const memoryHealthy = memoryUsagePercent < 90;
      
      const loadAverage = process.platform !== 'win32' ? process.loadavg() : [0, 0, 0];
      const cpuHealthy = loadAverage[0] < 2.0; // 1-minute load average
      
      const overallHealthy = memoryHealthy && cpuHealthy;
      
      return {
        status: overallHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: {
          rss: memoryUsage.rss,
          heapTotal: memoryUsage.heapTotal,
          heapUsed: memoryUsage.heapUsed,
          external: memoryUsage.external,
          usagePercent: memoryUsagePercent,
          healthy: memoryHealthy,
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
          loadAverage: loadAverage,
          healthy: cpuHealthy,
        },
        process: {
          pid: process.pid,
          ppid: process.ppid,
          platform: process.platform,
          version: process.version,
          arch: process.arch,
        },
      };
    });
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    logger.error('Metrics health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Application-specific health check
router.get('/application', async (req, res) => {
  try {
    const healthStatus = await traceHealthCheck('application', async () => {
      const { query } = require('../../database/config/database');
      
      // Check application-specific health indicators
      const [
        userCount,
        projectCount,
        validationCount,
        agentCount,
      ] = await Promise.all([
        query('SELECT COUNT(*) as count FROM users WHERE is_active = true'),
        query('SELECT COUNT(*) as count FROM projects WHERE is_active = true'),
        query('SELECT COUNT(*) as count FROM validation_executions WHERE created_at > NOW() - INTERVAL \'24 hours\''),
        query('SELECT COUNT(*) as count FROM agents WHERE status = \'active\''),
      ]);
      
      const stats = {
        activeUsers: parseInt(userCount.rows[0].count),
        activeProjects: parseInt(projectCount.rows[0].count),
        validationsLast24h: parseInt(validationCount.rows[0].count),
        activeAgents: parseInt(agentCount.rows[0].count),
      };
      
      // Application is healthy if we have active users and projects
      const appHealthy = stats.activeUsers > 0 && stats.activeProjects >= 0;
      
      return {
        status: appHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
        statistics: stats,
        features: {
          userManagement: true,
          projectManagement: true,
          validationEngine: true,
          agentManagement: true,
          knowledgeGraph: true,
          apiAccess: true,
          webSocketSupport: true,
        },
      };
    });
    
    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
    
  } catch (error) {
    logger.error('Application health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;