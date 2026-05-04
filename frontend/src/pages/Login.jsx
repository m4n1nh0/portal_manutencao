import { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import api from '../utils/api';
import { PasswordInput } from '../components/UI';

export default function Login() {
  const { login }  = useAuth();
  const toast      = useToast();
  const navigate   = useNavigate();

  const [step,      setStep]      = useState('login'); // 'login' | 'otp'
  const [loginVal,  setLoginVal]  = useState('');
  const [senha,     setSenha]     = useState('');
  const [userId,    setUserId]    = useState('');
  const [otpMsg,    setOtpMsg]    = useState('');
  const [otp,       setOtp]       = useState(['','','','','','']);
  const [loading,   setLoading]   = useState(false);
  const [erro,      setErro]      = useState('');
  const otpRefs    = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  useEffect(() => {
    if (step === 'otp') otpRefs[0].current?.focus();
  }, [step]);

  // ── Passo 1: senha ────────────────────────────────────────────
  async function handleLogin(e) {
    e.preventDefault();
    setErro(''); setLoading(true);
    try {
      const res = await api.login(loginVal.trim(), senha);
      if (res.twofa) {
        setUserId(res.userId);
        setOtpMsg(res.mensagem);
        setStep('otp');
      } else {
        login(res.usuario, res.token, res.refreshToken);
        navigate('/app');
      }
    } catch(e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ── Passo 2: OTP ──────────────────────────────────────────────
  function handleOtpInput(idx, val) {
    const digits = val.replace(/\D/g,'').slice(0,1);
    const next   = [...otp];
    next[idx]    = digits;
    setOtp(next);
    if (digits && idx < 5) otpRefs[idx+1].current?.focus();
    if (next.every(d=>d)) submitOtp(next.join(''));
  }

  function handleOtpKeyDown(idx, e) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs[idx-1].current?.focus();
  }

  async function submitOtp(code) {
    setErro(''); setLoading(true);
    try {
      const res = await api.verifyOtp(userId, code);
      login(res.usuario, res.token, res.refreshToken);
      navigate('/app');
    } catch(e) {
      setErro(e.message);
      setOtp(['','','','','','']);
      otpRefs[0].current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div id="login-screen">
      <div className="login-card" style={{ animation:'slideUp .4s cubic-bezier(.16,1,.3,1)' }}>
        <div className="login-logo">
          <span className="login-icon">🏘️</span>
          <h1>Portal de Manutenção</h1>
          <p>Acesso restrito por perfil</p>
        </div>

        {step === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Usuário ou E-mail</label>
              <input className="form-control" type="text" placeholder="Digite seu usuário ou e-mail…"
                value={loginVal} onChange={e=>setLoginVal(e.target.value)}
                autoComplete="username" required />
            </div>
            <PasswordInput label="Senha" value={senha} onChange={e=>setSenha(e.target.value)}
              placeholder="Digite sua senha…" required />
            <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
              {loading ? '⏳ Verificando…' : 'Entrar'}
            </button>
            {erro && <div className="form-error">{erro}</div>}
            <div className="login-hint">
              É morador? <Link to="/register" style={{color:'var(--acc)'}}>Solicite seu acesso</Link>
            </div>
          </form>
        ) : (
          <div>
            <div style={{ textAlign:'center', marginBottom:'20px' }}>
              <div style={{ fontSize:'36px', marginBottom:'8px' }}>📱</div>
              <p style={{ fontSize:'14px', marginBottom:'4px', fontWeight:500 }}>Verificação em 2 etapas</p>
              <p style={{ fontSize:'13px', color:'var(--mu)' }}>{otpMsg}</p>
            </div>

            {/* Inputs de OTP */}
            <div style={{ display:'flex', gap:'8px', justifyContent:'center', marginBottom:'20px' }}>
              {otp.map((d,i) => (
                <input key={i} ref={otpRefs[i]}
                  type="text" inputMode="numeric" maxLength={1}
                  value={d} onChange={e=>handleOtpInput(i,e.target.value)}
                  onKeyDown={e=>handleOtpKeyDown(i,e)}
                  style={{
                    width:'46px', height:'56px', textAlign:'center',
                    fontSize:'24px', fontWeight:700, letterSpacing:'0',
                    background:'var(--bg)', border:'1.5px solid var(--bd)',
                    borderRadius:'8px', color:'var(--tx)',
                    outline:'none', transition:'border-color .15s',
                  }}
                  onFocus={e=>e.target.style.borderColor='var(--acc)'}
                  onBlur={e=>e.target.style.borderColor='var(--bd)'}
                />
              ))}
            </div>

            {loading && <div style={{textAlign:'center',color:'var(--mu)',fontSize:'13px',marginBottom:'12px'}}>⏳ Verificando…</div>}
            {erro    && <div className="form-error">{erro}</div>}

            <button className="btn btn-ghost btn-full" onClick={() => { setStep('login'); setOtp(['','','','','','']); setErro(''); }}
              style={{marginTop:'8px'}}>
              ← Voltar ao login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
