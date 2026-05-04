/**
 * migrate.js — Runner de migrations (chamado pelo entrypoint)
 * Aplica arquivos SQL de database/migrations/ em ordem, apenas uma vez.
 * Seguro para produção: cada migration roda apenas uma vez.
 */
const path  = require('path');
const fs    = require('fs');

// Resolve dotenv se existir (dev local)
const envFile = path.resolve(__dirname, '../.env');
if (fs.existsSync(envFile)) require('dotenv').config({ path: envFile });

const mysql = require('mysql2/promise');

// Reutiliza a mesma lógica de conexão do database.js
function getDbConfig() {
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL || process.env.DB_URL;
  if (url) {
    try {
      const u = new URL(url);
      return { host:u.hostname, port:parseInt(u.port||'3306'), database:u.pathname.replace(/^\//,''), user:u.username, password:u.password };
    } catch {}
  }
  if (process.env.MYSQLHOST) {
    return { host:process.env.MYSQLHOST, port:parseInt(process.env.MYSQLPORT||'3306'), database:process.env.MYSQLDATABASE||'portal_manutencao', user:process.env.MYSQLUSER, password:process.env.MYSQLPASSWORD };
  }
  return { host:process.env.DB_HOST||'localhost', port:parseInt(process.env.DB_PORT||'3306'), database:process.env.DB_NAME||'portal_manutencao', user:process.env.DB_USER, password:process.env.DB_PASSWORD };
}

const MIGRATIONS_DIR = path.resolve(__dirname, '../../database/migrations');
const SCHEMA_FILE    = path.resolve(__dirname, '../../database/schema.sql');

function stripSeedBlocks(sql) {
  return sql.replace(/^\s*--\s*@seed:start[\s\S]*?^\s*--\s*@seed:end\s*$/gm, '');
}

async function run() {
  const cfg    = getDbConfig();
  const { database, ...serverCfg } = cfg;
  const conn   = await mysql.createConnection({ ...serverCfg, multipleStatements: true });

  try {
    // Garante que o banco existe
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${database}\``);

    // Cria tabela de controle de migrations
    await conn.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        filename   VARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Aplica schema base se migrations dir não existir
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      const [applied] = await conn.query('SELECT filename FROM _migrations WHERE filename=?', ['schema.sql']);
      if (!applied.length && fs.existsSync(SCHEMA_FILE)) {
        console.log('Aplicando schema.sql...');
        const sql = stripSeedBlocks(fs.readFileSync(SCHEMA_FILE, 'utf8'));
        await conn.query(sql);
        await conn.query('INSERT INTO _migrations (filename) VALUES (?)', ['schema.sql']);
        console.log('✅ schema.sql aplicado.');
      }
      return;
    }

    // Lê e ordena migrations
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const [rows] = await conn.query('SELECT id FROM _migrations WHERE filename=?', [file]);
      if (rows.length) { console.log(`  ↩  Já aplicado: ${file}`); continue; }

      console.log(`  ⚙  Aplicando: ${file}`);
      const sql = stripSeedBlocks(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
      await conn.query(sql);
      await conn.query('INSERT INTO _migrations (filename) VALUES (?)', [file]);
      console.log(`  ✅ ${file}`);
    }

    console.log('\n✅ Migrations concluídas.');
  } finally {
    await conn.end();
  }
}

run().catch(err => {
  console.error('❌ Migration falhou:', err.message);
  process.exit(1);
});
