/**
 * seed.js - inserts initial users if they do not exist.
 * Idempotent: safe to run on every dev/container start.
 */
const path = require('path');
const fs = require('fs');

const envFile = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFile)) require('dotenv').config({ path: envFile });

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

function isDevSeedAllowed() {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' || process.env.ALLOW_DEV_SEEDS === 'true';
}

function getDbConfig() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL || process.env.DB_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port || '3306'),
        database: parsed.pathname.replace(/^\//, ''),
        user: parsed.username,
        password: parsed.password,
      };
    } catch {}
  }

  if (process.env.MYSQLHOST) {
    return {
      host: process.env.MYSQLHOST,
      port: parseInt(process.env.MYSQLPORT || '3306'),
      database: process.env.MYSQLDATABASE || 'portal_manutencao',
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
    };
  }

  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_NAME || 'portal_manutencao',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

const USUARIOS = [
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

async function run() {
  if (!isDevSeedAllowed()) {
    console.log(`Skipping seeds: NODE_ENV=${process.env.NODE_ENV || '(unset)'}. Seeds run only in development.`);
    return;
  }

  const cfg = getDbConfig();
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: true });

  try {
    await conn.query(`USE \`${cfg.database}\``);
    const seedFile = path.resolve(__dirname, '../../database/seeds/dev.sql');
    if (fs.existsSync(seedFile)) {
      console.log('Applying development seed data...');
      await conn.query(fs.readFileSync(seedFile, 'utf8'));
    }

    console.log('Inserting initial users...');

    for (const user of USUARIOS) {
      const [[existing]] = await conn.query(
        'SELECT id FROM usuarios WHERE login=? OR email=?',
        [user.login, user.email],
      );

      if (existing) {
        console.log(`  already exists: ${user.login}`);
        continue;
      }

      const hash = await bcrypt.hash(user.senha, 12);
      await conn.query(
        `INSERT INTO usuarios
          (id, login, nome, email, telefone, cpf, unidade, senha_hash, perfil, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aprovado')`,
        [
          uuidv4(),
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

      console.log(`  inserted: ${user.login} (${user.perfil})`);
    }

    console.log('Seeds completed.');
  } finally {
    await conn.end();
  }
}

run().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
