/**
 * Runs SQL migrations from database/migrations in filename order.
 * Each migration is recorded in _migrations and applied only once.
 */
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

const envFile = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFile)) require('dotenv').config({ path: envFile });

const logger = require('../src/config/logger');
const {
  resolveDbConfig,
  dbConnectionOptions,
  summarizeDbConfig,
  dbConfigProblems,
} = require('../src/config/dbConfig');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');
const SCHEMA_FILE = path.resolve(__dirname, '../../database/schema.sql');

function stripSeedBlocks(sql) {
  return sql.replace(/^\s*--\s*@seed:start[\s\S]*?^\s*--\s*@seed:end\s*$/gm, '');
}

async function timedStep(name, meta, fn) {
  const startedAt = Date.now();
  logger.info(`${name} started`, meta);
  try {
    const result = await fn();
    logger.info(`${name} finished`, {
      ...meta,
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    logger.error(`${name} failed`, {
      ...meta,
      durationMs: Date.now() - startedAt,
      error,
    });
    throw error;
  }
}

async function run() {
  const { config, warnings } = resolveDbConfig();
  const dbSummary = summarizeDbConfig(config);
  const { database, ...serverOptions } = dbConnectionOptions(config);

  warnings.forEach((warning) => logger.warn('Database configuration warning', { warning }));

  const problems = dbConfigProblems(config);
  if (problems.length) {
    logger.warn('Database configuration looks incomplete', {
      db: dbSummary,
      problems,
    });
  }

  logger.info('Migration runner configured', {
    db: dbSummary,
    migrationsDir: MIGRATIONS_DIR,
    schemaFile: SCHEMA_FILE,
  });

  const conn = await timedStep('Database server connection', { db: dbSummary }, () =>
    mysql.createConnection({
      ...serverOptions,
      multipleStatements: true,
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
    }));

  try {
    await timedStep('Database selection', { database }, async () => {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await conn.query(`USE \`${database}\``);
      await conn.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          filename VARCHAR(255) NOT NULL UNIQUE,
          applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    });

    if (!fs.existsSync(MIGRATIONS_DIR)) {
      logger.warn('Migrations directory not found; falling back to schema.sql', {
        migrationsDir: MIGRATIONS_DIR,
      });

      const [applied] = await conn.query('SELECT filename FROM _migrations WHERE filename=?', ['schema.sql']);
      if (!applied.length && fs.existsSync(SCHEMA_FILE)) {
        await timedStep('schema.sql migration', { file: SCHEMA_FILE }, async () => {
          const sql = stripSeedBlocks(fs.readFileSync(SCHEMA_FILE, 'utf8'));
          await conn.query(sql);
          await conn.query('INSERT INTO _migrations (filename) VALUES (?)', ['schema.sql']);
        });
      } else {
        logger.info('schema.sql already applied or missing', {
          applied: Boolean(applied.length),
          exists: fs.existsSync(SCHEMA_FILE),
        });
      }
      return;
    }

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    logger.info('Migration files discovered', {
      count: files.length,
      files,
    });

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const [rows] = await conn.query('SELECT id FROM _migrations WHERE filename=?', [file]);
      if (rows.length) {
        skippedCount += 1;
        logger.info('Migration already applied', { file });
        continue;
      }

      await timedStep('Migration apply', { file }, async () => {
        const sql = stripSeedBlocks(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        await conn.query(sql);
        await conn.query('INSERT INTO _migrations (filename) VALUES (?)', [file]);
      });
      appliedCount += 1;
    }

    logger.info('Migrations completed', {
      discovered: files.length,
      applied: appliedCount,
      skipped: skippedCount,
    });
  } finally {
    await conn.end();
    logger.info('Migration database connection closed', { db: dbSummary });
  }
}

run().catch((error) => {
  logger.error('Migration runner failed', { error });
  process.exit(1);
});
