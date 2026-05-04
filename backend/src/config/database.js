const mysql = require('mysql2/promise');

// ── Suporte às variáveis do Railway MySQL ──────────────────────
// Railway injeta: MYSQL_URL, MYSQLHOST, MYSQLPORT, MYSQLUSER, MYSQLPASSWORD, MYSQLDATABASE
// Também aceita: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME (padrão)
function getDbConfig() {
  // Prioridade 1: URL completa (MYSQL_URL ou DATABASE_URL)
  const url = process.env.MYSQL_URL || process.env.DATABASE_URL || process.env.DB_URL;
  if (url) {
    try {
      const u = new URL(url);
      return {
        host:     u.hostname,
        port:     parseInt(u.port || '3306'),
        database: u.pathname.replace(/^\//, ''),
        user:     u.username,
        password: u.password,
      };
    } catch (e) {
      console.warn('⚠️  MYSQL_URL inválida, usando variáveis individuais.');
    }
  }

  // Prioridade 2: Variáveis nativas do Railway (MYSQLHOST etc.)
  if (process.env.MYSQLHOST) {
    return {
      host:     process.env.MYSQLHOST,
      port:     parseInt(process.env.MYSQLPORT || '3306'),
      database: process.env.MYSQLDATABASE || 'portal_manutencao',
      user:     process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
    };
  }

  // Prioridade 3: Variáveis convencionais DB_*
  return {
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    database: process.env.DB_NAME     || 'portal_manutencao',
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  };
}

const dbConfig = getDbConfig();

const pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit:    parseInt(process.env.DB_POOL_MAX || '10'),
  charset:            'utf8mb4',
  timezone:           'local',
  enableKeepAlive:    true,
  keepAliveInitialDelay: 0,
});

pool.getConnection()
  .then(c => { c.release(); console.log(`✅ MySQL conectado em ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`); })
  .catch(e => { console.error('❌ MySQL:', e.message); process.exit(1); });

module.exports = pool;
