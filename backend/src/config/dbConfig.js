function parsePort(value, fallback = 3306) {
  const parsed = parseInt(value || fallback, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstUrl(env) {
  for (const key of ['MYSQL_URL', 'DATABASE_URL', 'DB_URL']) {
    if (env[key]) return { key, value: env[key] };
  }
  return null;
}

function parseDatabaseUrl(candidate) {
  const url = new URL(candidate.value);
  return {
    source: candidate.key,
    host: url.hostname,
    port: parsePort(url.port, 3306),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
  };
}

function resolveDbConfig(env = process.env) {
  const warnings = [];
  const candidate = firstUrl(env);

  if (candidate) {
    try {
      return { config: parseDatabaseUrl(candidate), warnings };
    } catch (error) {
      warnings.push(`${candidate.key} is invalid: ${error.message}`);
    }
  }

  if (env.MYSQLHOST) {
    return {
      config: {
        source: 'MYSQLHOST',
        host: env.MYSQLHOST,
        port: parsePort(env.MYSQLPORT, 3306),
        database: env.MYSQLDATABASE || 'portal_manutencao',
        user: env.MYSQLUSER,
        password: env.MYSQLPASSWORD,
      },
      warnings,
    };
  }

  return {
    config: {
      source: 'DB_*',
      host: env.DB_HOST || 'localhost',
      port: parsePort(env.DB_PORT, 3306),
      database: env.DB_NAME || 'portal_manutencao',
      user: env.DB_USER,
      password: env.DB_PASSWORD,
    },
    warnings,
  };
}

function getDbConfig(env = process.env) {
  return resolveDbConfig(env).config;
}

function dbConnectionOptions(config) {
  const { source, ...options } = config;
  return options;
}

function summarizeDbConfig(config) {
  return {
    source: config.source,
    host: config.host || '(unset)',
    port: config.port || '(unset)',
    database: config.database || '(unset)',
    user: config.user || '(unset)',
    password: config.password ? '[set]' : '(unset)',
  };
}

function dbConfigProblems(config) {
  const problems = [];
  if (!config.host) problems.push('DB host is empty');
  if (!config.port) problems.push('DB port is empty');
  if (!config.database) problems.push('DB database name is empty');
  if (!config.user) problems.push('DB user is empty');
  if (!config.password) problems.push('DB password is empty');
  return problems;
}

module.exports = {
  resolveDbConfig,
  getDbConfig,
  dbConnectionOptions,
  summarizeDbConfig,
  dbConfigProblems,
};
