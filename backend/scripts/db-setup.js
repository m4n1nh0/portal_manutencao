#!/usr/bin/env node
// FIX: path relativo ao CWD onde o script é executado
const envPath = require('path').resolve(process.cwd(), 'backend', '.env');
const fs_env = require('fs');
require('dotenv').config({ path: fs_env.existsSync(envPath) ? envPath : require('path').resolve('.env') });
const mysql  = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const fs     = require('fs');
const path   = require('path');

const RESET = process.argv.includes('--reset');
const DB    = process.env.DB_NAME || 'portal_manutencao';

if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development' && process.env.ALLOW_DEV_SEEDS !== 'true') {
  console.error('db-setup is development-only because it applies schema/seed data.');
  console.error('Use migrations in non-development environments.');
  process.exit(1);
}

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

    console.log('👤 Inserindo usuários...');
    for (const u of ADMINS) {
      const [r] = await conn.query('SELECT id FROM usuarios WHERE login=?', [u.login]);
      if (r.length) { console.log(`  ↩  Já existe: ${u.login}`); continue; }
      const hash = await bcrypt.hash(u.senha, 12);
      await conn.query(
        `INSERT INTO usuarios
          (login,nome,email,telefone,cpf,senha_hash,perfil,status,unidade,twofa_habilitado)
         VALUES (?,?,?,?,?,?,?,?,?,0)`,
        [u.login, u.nome, u.email, u.telefone||null, u.cpf||null, hash, u.perfil, u.status, u.unidade||null]
      );
      console.log(`  ✓  ${u.login} (${u.perfil}) — senha: ${u.senha}`);
    }

    console.log('\n🎉 Setup concluído!');
    console.log('   cd backend && npm start\n');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
