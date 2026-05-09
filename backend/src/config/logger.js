const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const SECRET_KEYS = /(pass(word)?|secret|token|key|authorization|cookie|jwt|smtp_pass|access_key)/i;

function currentLevel() {
  const configured = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[configured] ?? LEVELS.info;
}

function shouldLog(level) {
  return LEVELS[level] <= currentLevel();
}

function redact(key, value) {
  if (SECRET_KEYS.test(key)) {
    if (value === '(unset)') return '(unset)';
    if (value === undefined || value === null || value === '') return '(unset)';
    return '[redacted]';
  }
  return value;
}

function sanitize(value, key = '', seen = new WeakSet()) {
  const redacted = redact(key, value);
  if (redacted !== value) return redacted;

  if (value instanceof Error) {
    const out = {
      name: value.name,
      message: value.message,
    };
    ['code', 'errno', 'sqlState', 'sqlMessage', 'syscall', 'address', 'port'].forEach((prop) => {
      if (value[prop] !== undefined) out[prop] = value[prop];
    });
    if (value.stack && process.env.LOG_STACKS !== 'false') out.stack = value.stack;
    if (value.sql && process.env.LOG_SQL_ON_ERROR === 'true') {
      out.sql = String(value.sql).slice(0, 2000);
    }
    return out;
  }

  if (typeof value === 'string') {
    return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
  }

  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitize(item, key, seen));

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitize(entryValue, entryKey, seen),
    ]),
  );
}

function stringify(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  return JSON.stringify(value);
}

function write(level, message, meta = {}) {
  if (!shouldLog(level)) return;

  const service = process.env.LOG_SERVICE || 'portal-api';
  const safeMeta = sanitize(meta);
  const event = {
    ts: new Date().toISOString(),
    level,
    service,
    msg: message,
    ...safeMeta,
  };

  const line = process.env.LOG_FORMAT === 'json'
    ? JSON.stringify(event)
    : `${event.ts} ${level.toUpperCase().padEnd(5)} [${service}] ${message}${
        Object.keys(safeMeta).length
          ? ` ${Object.entries(safeMeta).map(([key, value]) => `${key}=${stringify(value)}`).join(' ')}`
          : ''
      }`;

  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  stream(line);
}

module.exports = {
  error: (message, meta) => write('error', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  info: (message, meta) => write('info', message, meta),
  debug: (message, meta) => write('debug', message, meta),
  sanitize,
};
