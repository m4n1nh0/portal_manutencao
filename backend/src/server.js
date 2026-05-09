require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const logger = require('./config/logger');

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception; process will exit', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    error: reason instanceof Error ? reason : new Error(String(reason)),
  });
  if (process.env.EXIT_ON_UNHANDLED_REJECTION === 'true') process.exit(1);
});

const app = express();
function trustProxySetting() {
  if (process.env.TRUST_PROXY === undefined) return 1;
  if (process.env.TRUST_PROXY === 'true') return true;
  if (process.env.TRUST_PROXY === 'false') return false;
  const numeric = Number(process.env.TRUST_PROXY);
  return Number.isFinite(numeric) ? numeric : process.env.TRUST_PROXY;
}

app.set('trust proxy', trustProxySetting());

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads');
['comprovacoes', 'documentos'].forEach((dir) => {
  fs.mkdirSync(path.join(UPLOAD_DIR, dir), { recursive: true });
});

const CLIENT_URL = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({
  origin: CLIENT_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

const storageUrls = [
  process.env.S3_PUBLIC_URL,
  process.env.R2_PUBLIC_URL,
  process.env.LOCAL_UPLOAD_URL,
].filter(Boolean)
  .map((url) => {
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  })
  .filter(Boolean);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'fonts.gstatic.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', ...storageUrls, '*.amazonaws.com', '*.r2.cloudflarestorage.com'],
      connectSrc: ["'self'", ...storageUrls],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] || randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = Date.now();
  res.on('finish', () => {
    const meta = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    if (res.statusCode >= 500) {
      logger.error('HTTP request failed', meta);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP request rejected', meta);
    } else if (process.env.LOG_HTTP_REQUESTS === 'true' && req.path !== '/api/health') {
      logger.info('HTTP request completed', meta);
    }
  });

  next();
});

app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use('/api/auth/verify-otp', rateLimit({ windowMs: 15 * 60 * 1000, max: 30 }));
app.use('/api/auth/register', rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }));
app.use('/api/comprovacoes', rateLimit({ windowMs: 60 * 1000, max: 30 }));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '7d',
  setHeaders(res) {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  },
}));

// Keep the healthcheck public; /api routes below require authentication.
app.get('/api/health', (_, res) => res.json({
  ok: true,
  ts: new Date(),
  uptimeSec: Math.round(process.uptime()),
  storage: process.env.STORAGE_DRIVER || 'local',
  env: process.env.NODE_ENV || 'development',
}));

function wrapAsyncHandlers(router) {
  router.stack.forEach((layer) => {
    if (layer.route) {
      layer.route.stack.forEach((routeLayer) => {
        const handler = routeLayer.handle;
        if (handler.length >= 4) return;

        routeLayer.handle = (req, res, next) => {
          try {
            const result = handler(req, res, next);
            if (result && typeof result.catch === 'function') result.catch(next);
          } catch (error) {
            next(error);
          }
        };
      });
    } else if (layer.handle?.stack) {
      wrapAsyncHandlers(layer.handle);
    }
  });
  return router;
}

app.use('/api/auth', wrapAsyncHandlers(require('./routes/auth')));
app.use('/api/usuarios', wrapAsyncHandlers(require('./routes/usuarios')));
app.use('/api', wrapAsyncHandlers(require('./routes/api')));
app.use('/api', (req, res) => {
  logger.warn('API route not found', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
  });
  res.status(404).json({ erro: 'Rota nao encontrada.', requestId: req.id });
});

const SERVE_CLIENT = process.env.SERVE_CLIENT === 'true';
const CLIENT_DIST = process.env.CLIENT_DIST_DIR || path.join(__dirname, '../../client/dist');

if (SERVE_CLIENT) {
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
    logger.info('Serving frontend build', { clientDist: CLIENT_DIST });
  } else {
    logger.warn('SERVE_CLIENT=true but frontend build was not found', { clientDist: CLIENT_DIST });
  }
}

app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  logger.error('Unhandled HTTP error', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    status,
    error: err,
  });

  if (res.headersSent) return next(err);
  return res.status(status).json({
    erro: status >= 500 ? 'Erro interno.' : err.message,
    requestId: req.id,
  });
});

const PORT = parseInt(process.env.PORT || '3001');
logger.info('Server boot configuration', {
  nodeEnv: process.env.NODE_ENV || 'development',
  nodeVersion: process.version,
  port: PORT,
  mode: SERVE_CLIENT ? 'monolith' : 'api',
  storage: process.env.STORAGE_DRIVER || 'local',
  clientUrl: CLIENT_URL,
  uploadDir: UPLOAD_DIR,
  logLevel: process.env.LOG_LEVEL || 'info',
  logFormat: process.env.LOG_FORMAT || 'text',
});

const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info('HTTP server listening', {
    url: `http://0.0.0.0:${PORT}`,
    mode: SERVE_CLIENT ? 'monolith' : 'api',
  });
});

server.on('error', (error) => {
  logger.error('HTTP server failed', {
    port: PORT,
    error,
  });
  process.exit(1);
});

function shutdown(signal) {
  logger.info('Shutdown signal received', { signal });
  server.close(() => {
    logger.info('HTTP server closed', { signal });
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
