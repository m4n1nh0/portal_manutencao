#!/usr/bin/env node
// FIX: path relativo ao CWD onde o script é executado
const envPath = require('path').resolve(process.cwd(), 'backend', '.env');
const fs_env = require('fs');
require('dotenv').config({ path: fs_env.existsSync(envPath) ? envPath : require('path').resolve('.env') });
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs     = require('fs');
const path   = require('path');
const { v4: uuidv4 } = require('uuid');

const RESET = process.argv.includes('--reset');
const DB    = process.env.DB_NAME || 'portal_manutencao';
const SLUG  = process.env.TENANT_DEFAULT_SLUG || 'principal';
const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');

if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development' && process.env.ALLOW_DEV_SEEDS !== 'true') {
  console.error('db-setup is development-only because it applies schema/seed data.');
  console.error('Use migrations in non-development environments.');
  process.exit(1);
}

// Provedor do SaaS: opera o portal comercial, sem condomínio.
const SUPERADMIN = {
  login: process.env.SUPERADMIN_LOGIN || 'provedor',
  nome:  process.env.SUPERADMIN_NOME  || 'Provedor do Sistema',
  email: process.env.SUPERADMIN_EMAIL || 'provedor@portal.local',
  senha: process.env.SUPERADMIN_SENHA || 'Provedor@123',
};

const ADMINS = [
  { login:'admin',      nome:'Administrador',  email:'admin@condominio.com',      senha:'Admin@123',  perfil:'admin',      status:'aprovado' },
  { login:'supervisor', nome:'João Silva',     email:'supervisor@condominio.com', senha:'Super@123',  perfil:'supervisor', status:'aprovado' },
  { login:'sindico',    nome:'Carlos Mendes',  email:'sindico@condominio.com',    senha:'Sind@123',   perfil:'sindico',    status:'aprovado' },
  { login:'subsindico', nome:'Ana Costa',      email:'subsindico@condominio.com', senha:'Sub@123',    perfil:'subsindico', status:'aprovado' },
  { login:'conselho',   nome:'Maria Oliveira', email:'conselho@condominio.com',   senha:'Cons@123',   perfil:'conselho',   status:'aprovado' },
  { login:'campo',      nome:'Equipe Campo',   email:'campo@condominio.com',      senha:'Campo@123',  perfil:'campo',      status:'aprovado' },
  // Morador de exemplo (aprovado para demo)
  { login:'morador',    nome:'Pedro Santos',   email:'pedro@email.com',           senha:'Mor@123',    perfil:'morador',    status:'aprovado',
    unidade:'Lote 42', cpf:'123.456.789-00', telefone:'(79) 99999-0000' },
];

function stripSeedBlocks(sql) {
  return sql.replace(/^\s*--\s*@seed:start[\s\S]*?^\s*--\s*@seed:end\s*$/gm, '');
}

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
    charset: 'utf8mb4',
  });

  try {
    if (RESET) {
      console.log(`⚠️  Resetando banco "${DB}"...`);
      await conn.query(`DROP DATABASE IF EXISTS \`${DB}\``);
    }

    console.log('📦 Aplicando schema.sql...');
    const sql = fs.readFileSync(path.resolve(__dirname, '../../database/schema.sql'), 'utf8');
    await conn.query(sql);
    console.log('✅ Schema aplicado.\n');

    await conn.query(`USE \`${DB}\``);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // O schema.sql cobre só a base mono-condomínio; as migrations trazem a
    // multi-tenancy e a camada comercial.
    console.log('🧱 Aplicando migrations...');
    const arquivos = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const arquivo of arquivos) {
      const [[jaAplicada]] = await conn.query('SELECT id FROM _migrations WHERE filename=?', [arquivo]);
      if (jaAplicada) { console.log(`  ↩  Já aplicada: ${arquivo}`); continue; }
      await conn.query(stripSeedBlocks(fs.readFileSync(path.join(MIGRATIONS_DIR, arquivo), 'utf8')));
      await conn.query('INSERT INTO _migrations (filename) VALUES (?)', [arquivo]);
      console.log(`  ✓  ${arquivo}`);
    }
    console.log('✅ Migrations aplicadas.\n');

    const [[condominio]] = await conn.query('SELECT id, nome FROM condominios WHERE slug=?', [SLUG]);
    if (!condominio) {
      console.error(`❌ Condomínio "${SLUG}" não encontrado após as migrations.`);
      process.exit(1);
    }
    console.log(`🏢 Condomínio de demonstração: ${condominio.nome} (${SLUG})\n`);

    console.log('👤 Inserindo usuários do condomínio...');
    for (const u of ADMINS) {
      const [r] = await conn.query('SELECT id FROM usuarios WHERE condominio_id=? AND login=?', [condominio.id, u.login]);
      if (r.length) { console.log(`  ↩  Já existe: ${u.login}`); continue; }
      const hash = await bcrypt.hash(u.senha, 12);
      await conn.query(
        `INSERT INTO usuarios
          (id,condominio_id,login,nome,email,telefone,cpf,senha_hash,perfil,status,unidade,twofa_habilitado)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
        [uuidv4(), condominio.id, u.login, u.nome, u.email, u.telefone||null, u.cpf||null, hash, u.perfil, u.status, u.unidade||null]
      );
      console.log(`  ✓  ${u.login} (${u.perfil}) — senha: ${u.senha}`);
    }

    console.log('\n🛠  Criando conta do provedor...');
    const [existeSuper] = await conn.query(
      "SELECT id FROM usuarios WHERE condominio_id IS NULL AND perfil='superadmin' AND login=?", [SUPERADMIN.login]);
    if (existeSuper.length) {
      console.log(`  ↩  Já existe: ${SUPERADMIN.login}`);
    } else {
      const hash = await bcrypt.hash(SUPERADMIN.senha, 12);
      await conn.query(
        `INSERT INTO usuarios (id,condominio_id,login,nome,email,senha_hash,perfil,status,twofa_habilitado)
         VALUES (?,NULL,?,?,?,?,'superadmin','aprovado',0)`,
        [uuidv4(), SUPERADMIN.login, SUPERADMIN.nome, SUPERADMIN.email, hash]
      );
      console.log(`  ✓  ${SUPERADMIN.login} (superadmin) — senha: ${SUPERADMIN.senha}`);
    }

    console.log('\n🎉 Setup concluído!');
    console.log('   cd backend && npm start');
    console.log(`   Condomínio: http://${SLUG}.localhost:5173`);
    console.log('   Provedor:   http://admin.localhost:5173\n');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
