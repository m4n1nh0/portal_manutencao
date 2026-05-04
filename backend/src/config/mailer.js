const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST  || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || '"Portal Manutenção" <noreply@condominio.com>';

// ── Templates ──────────────────────────────────────────────────
function tplOTP(nome, code, expiresMin) {
  return {
    subject: `🔐 Seu código de acesso — Portal de Manutenção`,
    html: `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden;">
      <div style="background:#f0b429;padding:20px 28px;">
        <h2 style="margin:0;color:#000;font-size:20px;">🏘️ Portal de Manutenção</h2>
      </div>
      <div style="padding:28px;">
        <p style="font-size:16px;">Olá, <strong>${nome}</strong>!</p>
        <p style="color:#7d8590;font-size:14px;">Use o código abaixo para concluir seu login. Ele expira em <strong>${expiresMin} minutos</strong>.</p>
        <div style="background:#21262d;border:1px solid #30363d;border-radius:10px;padding:24px;text-align:center;margin:24px 0;">
          <div style="font-family:monospace;font-size:42px;font-weight:700;letter-spacing:12px;color:#f0b429;">${code}</div>
        </div>
        <p style="color:#f85149;font-size:13px;">⚠️ Nunca compartilhe este código. Nossa equipe nunca o solicita.</p>
      </div>
      <div style="background:#161b22;padding:14px 28px;font-size:11px;color:#7d8590;border-top:1px solid #30363d;">
        Se você não solicitou este acesso, ignore este e-mail.
      </div>
    </div>`,
  };
}

function tplAprovacao(nome, login, senha_temp) {
  return {
    subject: `✅ Seu cadastro foi aprovado — Portal de Manutenção`,
    html: `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden;">
      <div style="background:#3fb950;padding:20px 28px;">
        <h2 style="margin:0;color:#000;font-size:20px;">✅ Cadastro Aprovado!</h2>
      </div>
      <div style="padding:28px;">
        <p>Olá, <strong>${nome}</strong>!</p>
        <p style="color:#7d8590;font-size:14px;">Seu cadastro no Portal de Manutenção foi aprovado. Use as credenciais abaixo:</p>
        <div style="background:#21262d;border:1px solid #30363d;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="margin:0 0 8px"><strong>Login:</strong> <code style="color:#58a6ff">${login}</code></p>
          ${senha_temp ? `<p style="margin:0"><strong>Senha temporária:</strong> <code style="color:#f0b429">${senha_temp}</code></p>` : ''}
        </div>
        <p style="color:#7d8590;font-size:13px;">Por segurança, altere sua senha no primeiro acesso.</p>
      </div>
    </div>`,
  };
}

function tplRejeicao(nome, motivo) {
  return {
    subject: `❌ Cadastro não aprovado — Portal de Manutenção`,
    html: `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d1117;color:#e6edf3;border-radius:12px;overflow:hidden;">
      <div style="background:#f85149;padding:20px 28px;">
        <h2 style="margin:0;color:#fff;font-size:20px;">Cadastro não aprovado</h2>
      </div>
      <div style="padding:28px;">
        <p>Olá, <strong>${nome}</strong>.</p>
        <p style="color:#7d8590;">Infelizmente seu cadastro não foi aprovado pelo seguinte motivo:</p>
        <div style="background:#21262d;border-left:3px solid #f85149;border-radius:4px;padding:12px 16px;margin:16px 0;color:#f85149;">
          ${motivo || 'Não foi possível confirmar sua residência no condomínio.'}
        </div>
        <p style="font-size:13px;color:#7d8590;">Em caso de dúvidas, entre em contato com a administração.</p>
      </div>
    </div>`,
  };
}

async function sendOTP(to, nome, code) {
  const mins = parseInt(process.env.OTP_EXPIRES_MINUTES || '10');
  const tpl  = tplOTP(nome, code, mins);
  await transporter.sendMail({ from: FROM, to, ...tpl });
}

async function sendAprovacao(to, nome, login, senha_temp) {
  const tpl = tplAprovacao(nome, login, senha_temp);
  await transporter.sendMail({ from: FROM, to, ...tpl });
}

async function sendRejeicao(to, nome, motivo) {
  const tpl = tplRejeicao(nome, motivo);
  await transporter.sendMail({ from: FROM, to, ...tpl });
}

module.exports = { sendOTP, sendAprovacao, sendRejeicao };
