require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();

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
  storage: process.env.STORAGE_DRIVER || 'local',
  env: process.env.NODE_ENV || 'development',
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api', require('./routes/api'));

const SERVE_CLIENT = process.env.SERVE_CLIENT === 'true';
const CLIENT_DIST = process.env.CLIENT_DIST_DIR || path.join(__dirname, '../../client/dist');

if (SERVE_CLIENT) {
  if (fs.existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));
    app.get('*', (_, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
    console.log(`Serving frontend from: ${CLIENT_DIST}`);
  } else {
    console.warn(`SERVE_CLIENT=true but dist was not found at: ${CLIENT_DIST}`);
  }
}

const PORT = parseInt(process.env.PORT || '3001');
app.listen(PORT, '0.0.0.0', () => {
  console.log('\nPortal de Manutencao v4');
  console.log(`   URL:     http://0.0.0.0:${PORT}`);
  console.log(`   Modo:    ${SERVE_CLIENT ? 'monolito' : 'API separada'}`);
  console.log(`   Storage: ${process.env.STORAGE_DRIVER || 'local'}`);
  console.log(`   Client:  ${CLIENT_URL}\n`);
});
