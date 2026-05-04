import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Spinner } from '../components/UI';
import api from '../utils/api';

export default function Auditoria() {
  const [log,     setLog]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [fAcao,   setFAcao]   = useState('');
  const [fRes,    setFRes]    = useState('');

  useEffect(() => { load(); }, [fAcao, fRes]);

  async function load() {
    setLoading(true);
    try {
      const r = await api.auditoriaGeral({ acao: fAcao, resultado: fRes, limite: 100 });
      setLog(r.log);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  const cores = { sucesso:'var(--grn)', falha:'var(--red)', bloqueado:'var(--acc)' };

  return (
    <Layout title="Auditoria de Acessos">
      <div className="filter-row" style={{marginBottom:'16px'}}>
        <select className="filter-select" value={fAcao} onChange={e => setFAcao(e.target.value)}>
          <option value="">Todas as ações</option>
          <option value="login_sucesso">Login bem-sucedido</option>
          <option value="login_falha">Login falhou</option>
          <option value="login_bloqueado">Login bloqueado</option>
          <option value="otp_enviado">OTP enviado</option>
          <option value="otp_validado">OTP validado</option>
          <option value="registro_morador">Registro de morador</option>
          <option value="usuario_aprovado">Usuário aprovado</option>
          <option value="usuario_rejeitado">Usuário rejeitado</option>
          <option value="fotos_enviadas">Fotos enviadas</option>
          <option value="senha_alterada">Senha alterada</option>
          <option value="senha_resetada">Senha resetada</option>
        </select>
        <select className="filter-select" value={fRes} onChange={e => setFRes(e.target.value)}>
          <option value="">Todos os resultados</option>
          <option value="sucesso">✅ Sucesso</option>
          <option value="falha">❌ Falha</option>
          <option value="bloqueado">🔒 Bloqueado</option>
        </select>
      </div>

      {loading ? <Spinner/> : (
        <div className="task-list">
          {log.length === 0 && (
            <div style={{textAlign:'center',padding:'40px',color:'var(--mu)'}}>
              Nenhum registro encontrado.
            </div>
          )}
          {log.map(l => (
            <div key={l.id} className="task-card" style={{borderLeft:`3px solid ${cores[l.resultado]||'var(--bd)'}`}}>
              <div className="task-card-top">
                <div className="task-card-title" style={{fontSize:'13px',fontFamily:'monospace'}}>
                  {l.acao}
                </div>
                <span className="badge" style={{
                  background: (cores[l.resultado]||'var(--bd)') + '22',
                  color: cores[l.resultado]||'var(--mu)',
                  border: `1px solid ${(cores[l.resultado]||'var(--bd)')}44`
                }}>
                  {l.resultado}
                </span>
              </div>
              <div className="task-card-meta">
                {l.usuario_nome && <span className="stag">{l.usuario_nome}</span>}
                {l.login        && <span className="muted-sm">@{l.login}</span>}
                {l.ip           && <span className="muted-sm">🌐 {l.ip}</span>}
                <span className="muted-sm">
                  🕐 {new Date(l.criado_em).toLocaleString('pt-BR')}
                </span>
              </div>
              {l.detalhe && (
                <div style={{
                  fontSize:'11px',color:'var(--mu)',marginTop:'4px',fontFamily:'monospace',
                  background:'var(--s2)',padding:'6px 8px',borderRadius:'4px',overflowX:'auto',
                }}>
                  {typeof l.detalhe === 'string' ? l.detalhe : JSON.stringify(l.detalhe)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
