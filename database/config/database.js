const { Pool } = require('pg');
const redis = require('redis');
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');

// Database configuration
const config = {
  postgresql: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'llm_validation',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || null,
    db: process.env.REDIS_DB || 0,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 3
  },
  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'neo4j',
    database: process.env.NEO4J_DATABASE || 'neo4j'
  }
};

// PostgreSQL connection pool
const pgPool = new Pool(config.postgresql);

// Redis client
const redisClient = redis.createClient(config.redis);

// Neo4j driver
const neo4jDriver = neo4j.driver(
  config.neo4j.uri,
  neo4j.auth.basic(config.neo4j.user, config.neo4j.password)
);

// Error handling
pgPool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

// Connection health checks
const checkPostgreSQLHealth = async () => {
  try {
    const client = await pgPool.connect();
    await client.query('SELECT 1');
    client.release();
    return { status: 'healthy', timestamp: new Date() };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, timestamp: new Date() };
  }
};

const checkRedisHealth = async () => {
  try {
    await redisClient.ping();
    return { status: 'healthy', timestamp: new Date() };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, timestamp: new Date() };
  }
};

const checkNeo4jHealth = async () => {
  const session = neo4jDriver.session();
  try {
    await session.run('RETURN 1');
    return { status: 'healthy', timestamp: new Date() };
  } catch (error) {
    return { status: 'unhealthy', error: error.message, timestamp: new Date() };
  } finally {
    await session.close();
  }
};

// Database migration runner
const runMigrations = async () => {
  console.log('Running database migrations...');
  
  try {
    // Check if migrations table exists
    const migrationTableExists = await pgPool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'migrations'
      )
    `);
    
    if (!migrationTableExists.rows[0].exists) {
      // Create migrations table
      await pgPool.query(`
        CREATE TABLE migrations (
          id SERIAL PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Created migrations table');
    }
    
    // Get executed migrations
    const executedMigrations = await pgPool.query(
      'SELECT filename FROM migrations ORDER BY id'
    );
    const executedFiles = executedMigrations.rows.map(row => row.filename);
    
    // Get migration files
    const migrationDir = path.join(__dirname, '../schema');
    const migrationFiles = fs.readdirSync(migrationDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    // Execute pending migrations
    for (const file of migrationFiles) {
      if (!executedFiles.includes(file)) {
        console.log(`Executing migration: ${file}`);
        
        const migrationPath = path.join(migrationDir, file);
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        await pgPool.query('BEGIN');
        try {
          await pgPool.query(migrationSQL);
          await pgPool.query(
            'INSERT INTO migrations (filename) VALUES ($1)',
            [file]
          );
          await pgPool.query('COMMIT');
          console.log(`✓ Migration ${file} executed successfully`);
        } catch (error) {
          await pgPool.query('ROLLBACK');
          throw error;
        }
      }
    }
    
    console.log('All migrations completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
};

// Initialize connections
const initializeConnections = async () => {
  console.log('Initializing database connections...');
  
  try {
    // Test PostgreSQL connection
    await checkPostgreSQLHealth();
    console.log('✓ PostgreSQL connection established');
    
    // Test Redis connection
    await redisClient.connect();
    await checkRedisHealth();
    console.log('✓ Redis connection established');
    
    // Test Neo4j connection (optional for MVP)
    try {
      await checkNeo4jHealth();
      console.log('✓ Neo4j connection established');
    } catch (error) {
      console.warn('⚠ Neo4j connection failed (optional for MVP):', error.message);
    }
    
    // Run migrations
    await runMigrations();
    
    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

// Graceful shutdown
const closeConnections = async () => {
  console.log('Closing database connections...');
  
  try {
    await pgPool.end();
    await redisClient.quit();
    await neo4jDriver.close();
    console.log('All database connections closed');
  } catch (error) {
    console.error('Error closing connections:', error);
  }
};

// Query helpers
const query = async (text, params) => {
  const start = Date.now();
  const result = await pgPool.query(text, params);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    console.warn(`Slow query detected (${duration}ms):`, text);
  }
  
  return result;
};

const transaction = async (callback) => {
  const client = await pgPool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Cache helpers
const cacheGet = async (key) => {
  try {
    const value = await redisClient.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
};

const cacheSet = async (key, value, ttl = 3600) => {
  try {
    await redisClient.setEx(key, ttl, JSON.stringify(value));
  } catch (error) {
    console.error('Cache set error:', error);
  }
};

const cacheDel = async (key) => {
  try {
    await redisClient.del(key);
  } catch (error) {
    console.error('Cache delete error:', error);
  }
};

// Health check endpoint data
const getHealthStatus = async () => {
  const [postgresql, redis, neo4j] = await Promise.all([
    checkPostgreSQLHealth(),
    checkRedisHealth(),
    checkNeo4jHealth()
  ]);
  
  return {
    postgresql,
    redis,
    neo4j,
    overall: postgresql.status === 'healthy' && redis.status === 'healthy' ? 'healthy' : 'degraded'
  };
};

module.exports = {
  // Connection objects
  pgPool,
  redisClient,
  neo4jDriver,
  
  // Connection management
  initializeConnections,
  closeConnections,
  
  // Query helpers
  query,
  transaction,
  
  // Cache helpers
  cacheGet,
  cacheSet,
  cacheDel,
  
  // Health checks
  getHealthStatus,
  checkPostgreSQLHealth,
  checkRedisHealth,
  checkNeo4jHealth,
  
  // Migration runner
  runMigrations,
  
  // Configuration
  config
};
