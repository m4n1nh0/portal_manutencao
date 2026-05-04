const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const multer    = require('multer');
const multerS3  = require('multer-s3');
const path      = require('path');
const fs        = require('fs');
const { v4: uuidv4 } = require('uuid');

const DRIVER  = process.env.STORAGE_DRIVER || 'local';
const MAX_MB  = parseInt(process.env.MAX_UPLOAD_MB || '10');
const ALLOWED = ['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'];

// ── S3/R2 client ───────────────────────────────────────────────
let s3, BUCKET, PUBLIC_URL;

if (DRIVER === 's3') {
  s3 = new S3Client({
    region: process.env.S3_REGION || 'us-east-1',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  });
  BUCKET = process.env.S3_BUCKET; PUBLIC_URL = (process.env.S3_PUBLIC_URL||'').replace(/\/$/,'');
}
if (DRIVER === 'r2') {
  s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY },
    forcePathStyle: true,
  });
  BUCKET = process.env.R2_BUCKET; PUBLIC_URL = (process.env.R2_PUBLIC_URL||'').replace(/\/$/,'');
}

function buildStorage(folder) {
  if (DRIVER === 'local') {
    const dir = path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR || 'uploads', folder);
    fs.mkdirSync(dir, { recursive: true });
    return multer.diskStorage({
      destination: (_,__,cb) => cb(null, dir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
        cb(null, `${Date.now()}_${uuidv4()}${ext}`);
      },
    });
  }
  return multerS3({
    s3, bucket: BUCKET,
    acl: DRIVER === 's3' ? 'public-read' : undefined,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
      cb(null, `${folder}/${Date.now()}_${uuidv4()}${ext}`);
    },
  });
}

const createUpload = (folder, maxFiles = 5) => multer({
  storage:    buildStorage(folder),
  limits:     { fileSize: MAX_MB * 1024 * 1024 },
  fileFilter: (_, f, cb) => ALLOWED.includes(f.mimetype) ? cb(null, true) : cb(new Error('Tipo não permitido.')),
}).array('arquivo', maxFiles);

function getKey(file)  { return file.key || `comprovacoes/${file.filename}`; }
function pubUrl(key)   {
  if (DRIVER === 'local') return `${(process.env.LOCAL_UPLOAD_URL||'').replace(/\/$/,'')}/${key.split('/').pop()}`;
  return PUBLIC_URL ? `${PUBLIC_URL}/${key}` : null;
}
async function getUrl(key) {
  if (DRIVER === 'local') return pubUrl(key);
  if (!PUBLIC_URL) return getSignedUrl(s3, new GetObjectCommand({ Bucket:BUCKET, Key:key }), { expiresIn:3600 });
  return pubUrl(key);
}
async function del(key) {
  if (DRIVER === 'local') { try { fs.rmSync(path.resolve(process.cwd(), process.env.LOCAL_UPLOAD_DIR||'uploads', key.split('/').pop()), {force:true}); } catch{} return; }
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { createUpload, getKey, getUrl, pubUrl, del, DRIVER };
