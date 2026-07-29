#!/usr/bin/env node
/**
 * Cria (ou atualiza a senha da) conta do provedor do SaaS.
 *
 * Diferente do seed, roda em QUALQUER ambiente: sem essa conta ninguem
 * acessa o portal comercial depois do deploy, e os seeds ficam desligados
 * em producao por seguranca.
 *
 * Uso:
 *   node backend/scripts/criar-superadmin.js
 *   node backend/scripts/criar-superadmin.js --login provedor --email eu@dominio.com --senha 'Senha@123'
 *   SUPERADMIN_SENHA='Senha@123' node backend/scripts/criar-superadmin.js
 *
 * Com --resetar-senha, atualiza a senha de uma conta que ja existe.
 */
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const envFile = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFile)) require('dotenv').config({ path: envFile });

const logger = require('../src/config/logger');
const { resolveDbConfig, dbConnectionOptions, summarizeDbConfig } = require('../src/config/dbConfig');

function arg(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao;
}
const RESETAR = process.argv.includes('--resetar-senha');

const conta = {
  login: arg('login', process.env.SUPERADMIN_LOGIN || 'provedor'),
  nome:  arg('nome',  process.env.SUPERADMIN_NOME  || 'Provedor do Sistema'),
  email: arg('email', process.env.SUPERADMIN_EMAIL || 'provedor@portal.local'),
  senha: arg('senha', process.env.SUPERADMIN_SENHA || ''),
};

function validarSenha(senha) {
  const erros = [];
  if (senha.length < 8) erros.push('mínimo 8 caracteres');
  if (!/[A-Z]/.test(senha)) erros.push('uma letra maiúscula');
  if (!/[0-9]/.test(senha)) erros.push('um número');
  if (!/[^A-Za-z0-9]/.test(senha)) erros.push('um caractere especial');
  return erros;
}

async function run() {
  if (!conta.senha) {
    logger.error('Senha não informada', {
      hint: 'Use --senha "SuaSenha@123" ou defina SUPERADMIN_SENHA no ambiente.',
    });
    process.exit(1);
  }

  const problemas = validarSenha(conta.senha);
  if (problemas.length) {
    logger.error('Senha fraca para uma conta de provedor', { requisitos: problemas });
    process.exit(1);
  }

  const { config } = resolveDbConfig();
  const conn = await mysql.createConnection({
    ...dbConnectionOptions(config),
    connectTimeout: parseInt(process.env.DB_CONNECT_TIMEOUT_MS || '10000', 10),
  });
  logger.info('Conectado ao banco', { db: summarizeDbConfig(config) });

  try {
    const [[existeTabela]] = await conn.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'condominio_id'`
    );
    if (!existeTabela.n) {
      logger.error('Banco ainda não tem a estrutura multi-tenant', { hint: 'Rode as migrations antes: npm run migrate' });
      process.exit(1);
    }

    const [[atual]] = await conn.query(
      "SELECT id, login, email FROM usuarios WHERE condominio_id IS NULL AND perfil = 'superadmin' AND (login = ? OR email = ?)",
      [conta.login, conta.email]
    );

    const hash = await bcrypt.hash(conta.senha, 12);

    if (atual) {
      if (!RESETAR) {
        logger.warn('Conta de provedor já existe; nada foi alterado', {
          login: atual.login,
          hint: 'Use --resetar-senha para trocar a senha desta conta.',
        });
        return;
      }
      await conn.query('UPDATE usuarios SET senha_hash = ?, nome = ? WHERE id = ?', [hash, conta.nome, atual.id]);
      // Troca de senha derruba as sessões abertas, como no fluxo normal.
      await conn.query('UPDATE sessoes SET revogado = 1 WHERE usuario_id = ?', [atual.id]);
      logger.info('Senha do provedor atualizada', { login: atual.login });
      console.log(`\n✅ Senha atualizada para "${atual.login}".\n`);
      return;
    }

    const id = uuidv4();
    await conn.query(
      `INSERT INTO usuarios (id, condominio_id, login, nome, email, senha_hash, perfil, status, twofa_habilitado)
       VALUES (?, NULL, ?, ?, ?, ?, 'superadmin', 'aprovado', 0)`,
      [id, conta.login, conta.nome, conta.email, hash]
    );

    logger.info('Conta de provedor criada', { login: conta.login, email: conta.email });
    console.log(`\n✅ Provedor criado: ${conta.login} (${conta.email})`);
    console.log('   Acesse pelo portal do provedor e ative o 2FA em Minha Conta.\n');
  } finally {
    await conn.end();
  }
}

run().catch((error) => {
  if (error.code === 'ER_DUP_ENTRY') {
    logger.error('Já existe um usuário com este login ou e-mail', { login: conta.login, email: conta.email });
  } else {
    logger.error('Falha ao criar a conta de provedor', { error });
  }
  process.exit(1);
});
