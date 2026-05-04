import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import { mascaraCPF, mascaraTel, validaSenha } from '../utils/auth';
import { PasswordInput, SenhaForca, Input, InfoBox } from '../components/UI';

const STEPS = ['Dados Pessoais', 'Endereço', 'Documentos', 'Senha'];

export default function Register() {
  const navigate = useNavigate();
  const [step,    setStep]    = useState(0);
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);
  const [erros,   setErros]   = useState({});
  const [form,    setForm]    = useState({
    nome:'', email:'', cpf:'', telefone:'',
    unidade:'', senha:'', confirma:'',
  });
  const [docFrente, setDocFrente] = useState(null);
  const [docVerso,  setDocVerso]  = useState(null);

  function set(k, v) { setForm(p => ({...p,[k]:v})); setErros(p=>({...p,[k]:''})); }

  // ── Validações por step ────────────────────────────────────────
  function validateStep() {
    const e = {};
    if (step === 0) {
      if (!form.nome.trim())         e.nome     = 'Nome obrigatório.';
      if (!form.email.includes('@')) e.email    = 'E-mail inválido.';
      if (form.cpf.replace(/\D/g,'').length < 11) e.cpf = 'CPF inválido.';
      if (form.telefone.replace(/\D/g,'').length < 10) e.telefone = 'Telefone inválido.';
    }
    if (step === 1) {
      if (!form.unidade.trim()) e.unidade = 'Número da unidade obrigatório.';
    }
    if (step === 2) {
      if (!docFrente) e.docFrente = 'Frente do documento obrigatória.';
    }
    if (step === 3) {
      const pe = validaSenha(form.senha);
      if (pe.length)               e.senha    = pe.join(', ');
      if (form.senha !== form.confirma) e.confirma = 'As senhas não coincidem.';
    }
    setErros(e);
    return Object.keys(e).length === 0;
  }

  function nextStep() { if (validateStep()) setStep(s => Math.min(s+1, STEPS.length-1)); }
  function prevStep() { setStep(s => Math.max(s-1, 0)); }

  // ── Submit ────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    if (!validateStep()) return;
    setLoading(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k,v]) => { if (k!=='confirma') fd.append(k,v); });
      if (docFrente) fd.append('arquivo', docFrente);
      if (docVerso)  fd.append('arquivo', docVerso);
      await api.register(fd);
      setDone(true);
    } catch(e) {
      setErros({ geral: e.message });
    } finally {
      setLoading(false);
    }
  }

  if (done) return (
    <div id="login-screen">
      <div className="login-card" style={{ textAlign:'center' }}>
        <div style={{ fontSize:'56px', marginBottom:'16px' }}>✅</div>
        <h2 style={{ fontFamily:'Syne,sans-serif', marginBottom:'10px' }}>Cadastro enviado!</h2>
        <p style={{ color:'var(--mu)', fontSize:'14px', marginBottom:'20px' }}>
          Seu cadastro foi recebido e está aguardando aprovação da administração.
          Você receberá um e-mail quando for aprovado.
        </p>
        <button className="btn btn-primary btn-full" onClick={() => navigate('/login')}>
          Voltar ao login
        </button>
      </div>
    </div>
  );

  return (
    <div id="login-screen" style={{ padding:'20px', alignItems:'flex-start', paddingTop:'40px' }}>
      <div className="login-card" style={{ maxWidth:'480px' }}>
        <div className="login-logo" style={{ marginBottom:'20px' }}>
          <span className="login-icon" style={{ fontSize:'40px' }}>🏘️</span>
          <h1 style={{ fontSize:'19px' }}>Solicitar Acesso</h1>
          <p>Registro de Morador</p>
        </div>

        {/* Stepper */}
        <div style={{ display:'flex', gap:'4px', marginBottom:'24px' }}>
          {STEPS.map((s,i) => (
            <div key={i} style={{ flex:1 }}>
              <div style={{
                height:'4px', borderRadius:'2px',
                background: i <= step ? 'var(--acc)' : 'var(--bd)',
                transition:'background .3s',
              }}/>
              <div style={{ fontSize:'9px', color: i===step?'var(--acc)':'var(--mu)', marginTop:'4px', textAlign:'center' }}>
                {s}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {/* STEP 0: Dados pessoais */}
          {step === 0 && (
            <div style={{ animation:'fadeUp .2s ease' }}>
              <InfoBox>📋 Preencha seus dados pessoais exatamente como no documento de identidade.</InfoBox>
              <Input label="Nome completo" required value={form.nome}
                onChange={e=>set('nome',e.target.value)} placeholder="Seu nome completo" error={erros.nome}/>
              <Input label="E-mail" required type="email" value={form.email}
                onChange={e=>set('email',e.target.value)} placeholder="seu@email.com" error={erros.email}/>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <Input label="CPF" required value={form.cpf}
                  onChange={e=>set('cpf', mascaraCPF(e.target.value))}
                  placeholder="000.000.000-00" error={erros.cpf} maxLength={14}/>
                <Input label="Telefone" required value={form.telefone}
                  onChange={e=>set('telefone', mascaraTel(e.target.value))}
                  placeholder="(00) 00000-0000" error={erros.telefone} maxLength={15}/>
              </div>
            </div>
          )}

          {/* STEP 1: Unidade */}
          {step === 1 && (
            <div style={{ animation:'fadeUp .2s ease' }}>
              <InfoBox>🏠 Informe o número do seu lote ou unidade no condomínio.</InfoBox>
              <Input label="Número da unidade / lote" required value={form.unidade}
                onChange={e=>set('unidade',e.target.value)}
                placeholder="Ex: Lote 42, Casa 15, Apt 302…" error={erros.unidade}/>
              <div style={{
                background:'var(--s2)', border:'1px solid var(--bd)', borderRadius:'8px',
                padding:'14px', fontSize:'13px', color:'var(--mu)',
              }}>
                <p style={{ marginBottom:'8px', color:'var(--tx)', fontWeight:500 }}>📌 Informação importante</p>
                <p>Após o cadastro, a administração verificará seus dados com a lista de moradores antes de aprovar o acesso.</p>
              </div>
            </div>
          )}

          {/* STEP 2: Documentos */}
          {step === 2 && (
            <div style={{ animation:'fadeUp .2s ease' }}>
              <InfoBox>📄 Envie fotos do seu RG ou CNH para comprovação de identidade. As imagens são armazenadas com segurança.</InfoBox>

              <DocUpload label="Frente do documento (RG/CNH) *" file={docFrente}
                onChange={setDocFrente} error={erros.docFrente} accept="image/*,.pdf"/>
              <DocUpload label="Verso do documento (opcional)" file={docVerso}
                onChange={setDocVerso} accept="image/*,.pdf"/>

              <div style={{ fontSize:'12px', color:'var(--mu)', marginTop:'12px' }}>
                🔒 Documentos são criptografados e acessados apenas pela administração.
              </div>
            </div>
          )}

          {/* STEP 3: Senha */}
          {step === 3 && (
            <div style={{ animation:'fadeUp .2s ease' }}>
              <InfoBox color="var(--grn)" bg="rgba(63,185,80,.07)" border="rgba(63,185,80,.2)">
                🔒 Crie uma senha forte para proteger sua conta.
              </InfoBox>
              <PasswordInput label="Senha" required value={form.senha}
                onChange={e=>set('senha',e.target.value)} placeholder="Mínimo 8 caracteres…"
                error={erros.senha}/>
              {form.senha && <SenhaForca senha={form.senha}/>}
              <div style={{ marginTop:'10px' }}/>
              <PasswordInput label="Confirmar senha" required value={form.confirma}
                onChange={e=>set('confirma',e.target.value)} placeholder="Repita a senha…"
                error={erros.confirma}/>
              {erros.geral && <div className="form-error">{erros.geral}</div>}
            </div>
          )}

          {/* Navegação */}
          <div style={{ display:'flex', gap:'10px', marginTop:'20px' }}>
            {step > 0 && (
              <button type="button" className="btn btn-ghost" onClick={prevStep} style={{ flex:1 }}>
                ← Anterior
              </button>
            )}
            {step < STEPS.length-1 ? (
              <button type="button" className="btn btn-primary" onClick={nextStep} style={{ flex:2 }}>
                Próximo →
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" style={{ flex:2 }} disabled={loading}>
                {loading ? '⏳ Enviando…' : '✅ Enviar cadastro'}
              </button>
            )}
          </div>

          <div style={{ textAlign:'center', marginTop:'14px', fontSize:'13px', color:'var(--mu)' }}>
            Já tem acesso? <Link to="/login" style={{ color:'var(--acc)' }}>Fazer login</Link>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub-component: upload de documento ────────────────────────
function DocUpload({ label, file, onChange, error, accept }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <label style={{
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
        border:`2px dashed ${error?'var(--red)':file?'var(--grn)':'var(--bd)'}`,
        borderRadius:'10px', padding:'20px', cursor:'pointer',
        background: file ? 'rgba(63,185,80,.05)' : 'var(--bg)',
        transition:'all .2s',
      }}>
        <input type="file" accept={accept} style={{ display:'none' }}
          onChange={e => onChange(e.target.files[0]||null)}/>
        {file ? (
          <>
            <span style={{ fontSize:'24px', marginBottom:'6px' }}>✅</span>
            <span style={{ fontSize:'12px', color:'var(--grn)', textAlign:'center' }}>{file.name}</span>
            <span style={{ fontSize:'11px', color:'var(--mu)', marginTop:'4px' }}>
              {(file.size/1024).toFixed(0)} KB — Clique para trocar
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize:'28px', marginBottom:'8px' }}>📄</span>
            <span style={{ fontSize:'13px', color:'var(--mu)' }}>Clique ou arraste aqui</span>
            <span style={{ fontSize:'11px', color:'var(--mu)', marginTop:'4px' }}>JPG, PNG, PDF — max 10MB</span>
          </>
        )}
      </label>
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}
