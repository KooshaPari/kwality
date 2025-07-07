const promClient = require('prom-client');

// Create a registry for metrics
const register = new promClient.Registry();

// Add default metrics
promClient.collectDefaultMetrics({
  register,
  prefix: 'llm_validation_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
});

// Custom metrics for the LLM validation platform

// HTTP request metrics
const httpRequestsTotal = new promClient.Counter({
  name: 'llm_validation_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code', 'user_id'],
  registers: [register]
});

const httpRequestDuration = new promClient.Histogram({
  name: 'llm_validation_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1.0, 2.5, 5.0, 10.0],
  registers: [register]
});

// Database metrics
const dbQueryTotal = new promClient.Counter({
  name: 'llm_validation_db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['operation', 'table', 'status'],
  registers: [register]
});

const dbQueryDuration = new promClient.Histogram({
  name: 'llm_validation_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'table'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1.0, 2.0, 5.0],
  registers: [register]
});

const dbConnectionsActive = new promClient.Gauge({
  name: 'llm_validation_db_connections_active',
  help: 'Number of active database connections',
  registers: [register]
});

// Validation metrics
const validationExecutionsTotal = new promClient.Counter({
  name: 'llm_validation_executions_total',
  help: 'Total number of validation executions',
  labelNames: ['status', 'validation_type', 'user_id'],
  registers: [register]
});

const validationExecutionDuration = new promClient.Histogram({
  name: 'llm_validation_execution_duration_seconds',
  help: 'Duration of validation executions in seconds',
  labelNames: ['validation_type', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600],
  registers: [register]
});

const validationQueueSize = new promClient.Gauge({
  name: 'llm_validation_queue_size',
  help: 'Number of validations in queue',
  labelNames: ['priority'],
  registers: [register]
});

const validationSuccessRate = new promClient.Gauge({
  name: 'llm_validation_success_rate',
  help: 'Success rate of validations (0-1)',
  labelNames: ['validation_type'],
  registers: [register]
});

// Agent metrics
const agentStatus = new promClient.Gauge({
  name: 'llm_validation_agent_status',
  help: 'Status of validation agents (1=active, 0=inactive)',
  labelNames: ['agent_id', 'agent_type'],
  registers: [register]
});

const agentWorkload = new promClient.Gauge({
  name: 'llm_validation_agent_workload',
  help: 'Current workload of validation agents',
  labelNames: ['agent_id', 'agent_type'],
  registers: [register]
});

const agentExecutionTime = new promClient.Histogram({
  name: 'llm_validation_agent_execution_time_seconds',
  help: 'Time taken by agents to complete tasks',
  labelNames: ['agent_id', 'agent_type', 'task_type'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
  registers: [register]
});

// Cache metrics
const cacheHitTotal = new promClient.Counter({
  name: 'llm_validation_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register]
});

const cacheMissTotal = new promClient.Counter({
  name: 'llm_validation_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register]
});

const cacheSize = new promClient.Gauge({
  name: 'llm_validation_cache_size_bytes',
  help: 'Current size of cache in bytes',
  labelNames: ['cache_type'],
  registers: [register]
});

// WebSocket metrics
const websocketConnections = new promClient.Gauge({
  name: 'llm_validation_websocket_connections',
  help: 'Number of active WebSocket connections',
  registers: [register]
});

const websocketMessages = new promClient.Counter({
  name: 'llm_validation_websocket_messages_total',
  help: 'Total number of WebSocket messages',
  labelNames: ['type', 'direction'],
  registers: [register]
});

// System health metrics
const systemHealth = new promClient.Gauge({
  name: 'llm_validation_system_health',
  help: 'Overall system health (1=healthy, 0=unhealthy)',
  labelNames: ['component'],
  registers: [register]
});

const errorRate = new promClient.Gauge({
  name: 'llm_validation_error_rate',
  help: 'Error rate per minute',
  labelNames: ['error_type'],
  registers: [register]
});

// Business metrics
const activeUsers = new promClient.Gauge({
  name: 'llm_validation_active_users',
  help: 'Number of active users',
  labelNames: ['time_window'],
  registers: [register]
});

const projectsTotal = new promClient.Gauge({
  name: 'llm_validation_projects_total',
  help: 'Total number of projects',
  labelNames: ['status'],
  registers: [register]
});

const testsTotal = new promClient.Gauge({
  name: 'llm_validation_tests_total',
  help: 'Total number of tests',
  labelNames: ['status', 'priority'],
  registers: [register]
});

// Helper functions for recording metrics
const recordHttpRequest = (method, route, statusCode, duration, userId = null) => {
  httpRequestsTotal.inc({ method, route, status_code: statusCode, user_id: userId });
  httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
};

const recordDbQuery = (operation, table, duration, status = 'success') => {
  dbQueryTotal.inc({ operation, table, status });
  dbQueryDuration.observe({ operation, table }, duration);
};

const recordValidationExecution = (validationType, status, duration, userId = null) => {
  validationExecutionsTotal.inc({ status, validation_type: validationType, user_id: userId });
  validationExecutionDuration.observe({ validation_type: validationType, status }, duration);
};

const recordAgentTask = (agentId, agentType, taskType, duration) => {
  agentExecutionTime.observe({ agent_id: agentId, agent_type: agentType, task_type: taskType }, duration);
};

const recordCacheHit = (cacheType) => {
  cacheHitTotal.inc({ cache_type: cacheType });
};

const recordCacheMiss = (cacheType) => {
  cacheMissTotal.inc({ cache_type: cacheType });
};

const recordWebSocketMessage = (type, direction) => {
  websocketMessages.inc({ type, direction });
};

// Update system health periodically
const updateSystemHealth = async () => {
  try {
    const { getHealthStatus } = require('../../database/config/database');
    const healthStatus = await getHealthStatus();
    
    systemHealth.set({ component: 'database' }, healthStatus.postgresql.status === 'healthy' ? 1 : 0);
    systemHealth.set({ component: 'cache' }, healthStatus.redis.status === 'healthy' ? 1 : 0);
    systemHealth.set({ component: 'overall' }, healthStatus.overall === 'healthy' ? 1 : 0);
  } catch (error) {
    systemHealth.set({ component: 'overall' }, 0);
  }
};

// Update business metrics periodically
const updateBusinessMetrics = async () => {
  try {
    const { query } = require('../../database/config/database');
    
    // Active users in last 24 hours
    const activeUsersResult = await query(`
      SELECT COUNT(DISTINCT user_id) as count
      FROM user_sessions
      WHERE last_accessed > NOW() - INTERVAL '24 hours'
    `);
    activeUsers.set({ time_window: '24h' }, activeUsersResult.rows[0].count);
    
    // Active projects
    const projectsResult = await query(`
      SELECT is_active, COUNT(*) as count
      FROM projects
      GROUP BY is_active
    `);
    projectsResult.rows.forEach(row => {
      projectsTotal.set({ status: row.is_active ? 'active' : 'inactive' }, row.count);
    });
    
    // Tests by status and priority
    const testsResult = await query(`
      SELECT 
        CASE WHEN is_active THEN 'active' ELSE 'inactive' END as status,
        priority,
        COUNT(*) as count
      FROM tests
      GROUP BY is_active, priority
    `);
    testsResult.rows.forEach(row => {
      testsTotal.set({ status: row.status, priority: row.priority }, row.count);
    });
    
    // Validation success rate
    const validationStatsResult = await query(`
      SELECT 
        vt.type as validation_type,
        COUNT(*) as total,
        COUNT(CASE WHEN vr.status = 'passed' THEN 1 END) as passed
      FROM validation_results vr
      JOIN tests t ON vr.test_id = t.id
      JOIN validation_targets vt ON t.validation_target_id = vt.id
      WHERE vr.created_at > NOW() - INTERVAL '1 hour'
      GROUP BY vt.type
    `);
    validationStatsResult.rows.forEach(row => {
      const successRate = row.total > 0 ? row.passed / row.total : 0;
      validationSuccessRate.set({ validation_type: row.validation_type }, successRate);
    });
    
  } catch (error) {
    console.error('Error updating business metrics:', error);
  }
};

// Initialize metrics collection
const initializeMetrics = () => {
  // Update system health every 30 seconds
  setInterval(updateSystemHealth, 30000);
  
  // Update business metrics every 5 minutes
  setInterval(updateBusinessMetrics, 300000);
  
  // Initial update
  updateSystemHealth();
  updateBusinessMetrics();
  
  return register;
};

// Export metrics and helper functions
module.exports = {
  register,
  initializeMetrics,
  
  // Metrics objects
  httpRequestsTotal,
  httpRequestDuration,
  dbQueryTotal,
  dbQueryDuration,
  dbConnectionsActive,
  validationExecutionsTotal,
  validationExecutionDuration,
  validationQueueSize,
  validationSuccessRate,
  agentStatus,
  agentWorkload,
  agentExecutionTime,
  cacheHitTotal,
  cacheMissTotal,
  cacheSize,
  websocketConnections,
  websocketMessages,
  systemHealth,
  errorRate,
  activeUsers,
  projectsTotal,
  testsTotal,
  
  // Helper functions
  recordHttpRequest,
  recordDbQuery,
  recordValidationExecution,
  recordAgentTask,
  recordCacheHit,
  recordCacheMiss,
  recordWebSocketMessage,
  updateSystemHealth,
  updateBusinessMetrics
};