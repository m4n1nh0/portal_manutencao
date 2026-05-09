const mysql = require('mysql2/promise');
const logger = require('./logger');
const {
  resolveDbConfig,
  dbConnectionOptions,
  summarizeDbConfig,
  dbConfigProblems,
} = require('./dbConfig');

const { config: dbConfig, warnings } = resolveDbConfig();
const dbSummary = summarizeDbConfig(dbConfig);

warnings.forEach((warning) => logger.warn('Database configuration warning', { warning }));

const problems = dbConfigProblems(dbConfig);
if (problems.length) {
  logger.warn('Database configuration looks incomplete', {
    db: dbSummary,
    problems,
  });
}

const pool = mysql.createPool({
  ...dbConnectionOptions(dbConfig),
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_MAX || '10', 10),
  charset: 'utf8mb4',
  timezone: 'local',
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
});

logger.info('Database pool configured', { db: dbSummary });

pool.getConnection()
  .then((connection) => {
    connection.release();
    logger.info('Database connection verified', { db: dbSummary });
  })
  .catch((error) => {
    logger.error('Database connection failed during startup', {
      db: dbSummary,
      error,
    });
    process.exit(1);
  });

module.exports = pool;
