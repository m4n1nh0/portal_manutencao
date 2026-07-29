/**
 * Inserts development seed data and initial users.
 * Idempotent: safe to run more than once when seed execution is allowed.
 */
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const envFile = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFile)) require('dotenv').config({ path: envFile });

const logger = require('../src/config/logger');
const {
  resolveDbConfig,
  dbConnectionOptions,
  summarizeDbConfig,
  dbConfigProblems,
} = require('../src/config/dbConfig');

const SEEDS_DIR = path.resolve(__dirname, '../../database/seeds');
const SLUG_DEMO = process.env.TENANT_DEFAULT_SLUG || 'principal';

function isDevSeedAllowed() {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' || process.env.ALLOW_DEV_SEEDS === 'true';
}

// Conta do provedor do SaaS (portal comercial). Fica fora de qualquer condomínio.
const SUPERADMIN = {
  login: process.env.SUPERADMIN_LOGIN || 'provedor',
  nome: process.env.SUPERADMIN_NOME || 'Provedor do Sistema',
  email: process.env.SUPERADMIN_EMAIL || 'provedor@portal.local',
  senha: process.env.SUPERADMIN_SENHA || 'Provedor@123',
};

const USERS = [
  { login: 'admin', nome: 'Administrador', email: 'admin@condominio.com', senha: 'Admin@123', perfil: 'admin' },
  { login: 'supervisor', nome: 'Joao Silva', email: 'supervisor@condominio.com', senha: 'Super@123', perfil: 'supervisor' },
  { login: 'sindico', nome: 'Carlos Mendes', email: 'sindico@condominio.com', senha: 'Sind@123', perfil: 'sindico' },
  { login: 'subsindico', nome: 'Ana Costa', email: 'subsindico@condominio.com', senha: 'Sub@123', perfil: 'subsindico' },
  { login: 'conselho', nome: 'Maria Oliveira', email: 'conselho@condominio.com', senha: 'Cons@123', perfil: 'conselho' },
  { login: 'campo', nome: 'Equipe Campo', email: 'campo@condominio.com', senha: 'Campo@123', perfil: 'campo' },
  {
    login: 'morador',
    nome: 'Pedro Santos',
    email: 'pedro@email.com',
    senha: 'Mor@123',
    perfil: 'morador',
    telefone: '(79) 99999-0000',
    cpf: '123.456.789-00',
    unidade: 'Lote 42',
  },
];

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
  if (!isDevSeedAllowed()) {
    logger.warn('Seeds skipped by environment guard', {
      nodeEnv: process.env.NODE_ENV || '(unset)',
      allowDevSeeds: process.env.ALLOW_DEV_SEEDS === 'true',
      hint: 'Set ALLOW_DEV_SEEDS=true only when you intentionally want these sample users in this environment.',
    });
    return;
  }

  const { config, warnings } = resolveDbConfig();
  const dbSummary = summarizeDbConfig(config);

  warnings.forEach((warning) => logger.warn('Database configuration warning', { warning }));

  const problems = dbConfigProblems(config);
  if (problems.length) {
    logger.warn('Database configuration looks incomplete', {
      db: dbSummary,
      problems,
    });
  }

  logger.info('Seed runner configured', { db: dbSummary });

  const conn = await timedStep('Seed database connection', { db: dbSummary }, () =>
    mysql.createConnection({
      ...dbConnectionOptions(config),
      multipleStatements: true,
      connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
    }));

  try {
    await timedStep('Seed connection charset', { collation: 'utf8mb4_unicode_ci' }, async () => {
      await conn.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
    });

    await conn.query(`USE \`${config.database}\``);

    // Multi-tenant: todo dado de demonstração pertence a um condomínio.
    const [[condominio]] = await conn.query('SELECT id, nome FROM condominios WHERE slug = ?', [SLUG_DEMO]);
    if (!condominio) {
      logger.error('Condomínio de demonstração não encontrado; rode as migrations antes do seed', {
        slug: SLUG_DEMO,
        hint: 'npm run migrate',
      });
      process.exitCode = 1;
      return;
    }
    logger.info('Seed vinculado ao condomínio', { slug: SLUG_DEMO, nome: condominio.nome });

    if (fs.existsSync(SEEDS_DIR)) {
      const seedFiles = fs.readdirSync(SEEDS_DIR)
        .filter((file) => file.endsWith('.sql'))
        .sort();

      logger.info('SQL seed files discovered', {
        seedsDir: SEEDS_DIR,
        count: seedFiles.length,
        files: seedFiles,
      });

      for (const file of seedFiles) {
        const seedFile = path.join(SEEDS_DIR, file);
        await timedStep('SQL seed file', { file }, async () => {
          await conn.query(fs.readFileSync(seedFile, 'utf8'));
        });
      }
    } else {
      logger.info('SQL seeds directory not found; skipping', { seedsDir: SEEDS_DIR });
    }

    let inserted = 0;
    let skipped = 0;

    await timedStep('Initial users seed', { userCount: USERS.length, condominio: SLUG_DEMO }, async () => {
      for (const user of USERS) {
        const [[existing]] = await conn.query(
          'SELECT id FROM usuarios WHERE condominio_id=? AND (login=? OR email=?)',
          [condominio.id, user.login, user.email],
        );

        if (existing) {
          skipped += 1;
          logger.info('Seed user already exists', { login: user.login, perfil: user.perfil });
          continue;
        }

        const hash = await bcrypt.hash(user.senha, 12);
        await conn.query(
          `INSERT INTO usuarios
            (id, condominio_id, login, nome, email, telefone, cpf, unidade, senha_hash, perfil, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'aprovado')`,
          [
            uuidv4(),
            condominio.id,
            user.login,
            user.nome,
            user.email,
            user.telefone || null,
            user.cpf || null,
            user.unidade || null,
            hash,
            user.perfil,
          ],
        );

        inserted += 1;
        logger.info('Seed user inserted', { login: user.login, perfil: user.perfil });
      }
    });

    // Provedor do SaaS: não pertence a condomínio nenhum.
    await timedStep('Superadmin seed', { login: SUPERADMIN.login }, async () => {
      const [[existing]] = await conn.query(
        "SELECT id FROM usuarios WHERE condominio_id IS NULL AND perfil='superadmin' AND (login=? OR email=?)",
        [SUPERADMIN.login, SUPERADMIN.email],
      );
      if (existing) {
        logger.info('Superadmin já existe', { login: SUPERADMIN.login });
        return;
      }
      const hash = await bcrypt.hash(SUPERADMIN.senha, 12);
      await conn.query(
        `INSERT INTO usuarios (id, condominio_id, login, nome, email, senha_hash, perfil, status)
         VALUES (?, NULL, ?, ?, ?, ?, 'superadmin', 'aprovado')`,
        [uuidv4(), SUPERADMIN.login, SUPERADMIN.nome, SUPERADMIN.email, hash],
      );
      logger.info('Superadmin criado', { login: SUPERADMIN.login, email: SUPERADMIN.email });
    });

    logger.info('Seeds completed', { inserted, skipped });
  } finally {
    await conn.end();
    logger.info('Seed database connection closed', { db: dbSummary });
  }
}

run().catch((error) => {
  logger.error('Seed runner failed', { error });
  process.exit(1);
});
