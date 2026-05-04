import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { EmptyState, StatusBadge, Spinner, ConfirmDialog, InfoBox } from '../components/UI';
import { useToast } from '../hooks/useToast';
import api from '../utils/api';

export default function Aprovacoes() {
  const toast = useToast();
  const [pendentes, setPendentes] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  const [modal,     setModal]     = useState(null); // 'detalhe' | 'rejeitar'
  const [motivo,    setMotivo]    = useState('');
  const [confirm,   setConfirm]   = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { pendentes } = await api.pendentes();
      setPendentes(pendentes);
    } catch(e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function aprovar(id, nome) {
    try {
      await api.aprovar(id);
      toast(`${nome} aprovado! E-mail enviado.`, 'success');
      load();
      setModal(null); setSelected(null);
    } catch(e) { toast(e.message, 'error'); }
  }

  async function rejeitar() {
    if (!motivo.trim()) { toast('Informe o motivo.','error'); return; }
    try {
      await api.rejeitar(selected.id, motivo);
      toast('Cadastro rejeitado. E-mail enviado.','info');
      setModal(null); setSelected(null); setMotivo('');
      load();
    } catch(e) { toast(e.message,'error'); }
  }

  return (
    <Layout title="Aprovações de Moradores">
      {loading ? <Spinner/> : (
        <>
          {pendentes.length > 0 ? (
            <InfoBox>
              📋 {pendentes.length} cadastro(s) aguardando aprovação. Analise os documentos antes de aprovar.
            </InfoBox>
          ) : null}

          {pendentes.length === 0 ? (
            <EmptyState icon="✅" title="Nenhum cadastro pendente"
              desc="Todos os cadastros foram processados." />
          ) : (
            <div className="task-list">
              {pendentes.map(u => (
                <div key={u.id} className="task-card" style={{ cursor:'pointer' }}
                  onClick={() => { setSelected(u); setModal('detalhe'); }}>
                  <div className="task-card-top">
                    <div className="task-card-title">{u.nome}</div>
                    <StatusBadge status="pendente"/>
                  </div>
                  <div className="task-card-meta">
                    <span className="stag">Lote {u.unidade}</span>
                    <span className="muted-sm">{u.email}</span>
                    <span className="muted-sm">• {u.cpf}</span>
                  </div>
                  <div className="task-card-meta" style={{ marginTop:'4px' }}>
                    <span className="muted-sm">📅 {new Date(u.criado_em).toLocaleString('pt-BR')}</span>
                    {u.telefone && <span className="muted-sm">📱 {u.telefone}</span>}
                  </div>
                  <div className="task-actions" onClick={e => e.stopPropagation()}>
                    <button className="btn btn-success btn-sm" onClick={() => setConfirm({id:u.id, nome:u.nome})}>
                      ✓ Aprovar
                    </button>
                    <button className="btn btn-danger btn-sm"
                      onClick={() => { setSelected(u); setModal('rejeitar'); }}>
                      ✗ Rejeitar
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => { setSelected(u); setModal('detalhe'); }}>
                      🔍 Ver docs
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* MODAL DETALHE */}
      {modal==='detalhe' && selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:200,
          display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => setModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:'var(--s)', borderRadius:'20px 20px 0 0',
            width:'100%', maxWidth:'600px', maxHeight:'90vh', overflowY:'auto',
            padding:'20px 20px calc(20px + env(safe-area-inset-bottom))',
          }}>
            <div style={{ width:'36px', height:'4px', background:'var(--bd)', borderRadius:'2px', margin:'0 auto 16px' }}/>
            <h3 style={{ fontFamily:'Syne,sans-serif', marginBottom:'16px' }}>Dados do Cadastro</h3>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'16px' }}>
              {[
                ['Nome', selected.nome],
                ['E-mail', selected.email],
                ['CPF', selected.cpf],
                ['Telefone', selected.telefone],
                ['Unidade/Lote', selected.unidade],
                ['Cadastrado em', new Date(selected.criado_em).toLocaleString('pt-BR')],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'var(--s2)', borderRadius:'8px', padding:'10px' }}>
                  <div style={{ fontSize:'10px', color:'var(--mu)', textTransform:'uppercase', letterSpacing:'.05em' }}>{k}</div>
                  <div style={{ fontSize:'13px', marginTop:'2px' }}>{v||'—'}</div>
                </div>
              ))}
            </div>

            {/* Documentos */}
            <h4 style={{ fontSize:'13px', fontWeight:600, marginBottom:'10px', color:'var(--mu)' }}>Documentos enviados</h4>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'20px' }}>
              {[
                ['Frente', selected.doc_url_frente],
                ['Verso', selected.doc_url_verso],
              ].map(([lado, url]) => (
                <div key={lado} style={{ background:'var(--s2)', border:'1px solid var(--bd)', borderRadius:'10px', overflow:'hidden' }}>
                  <div style={{ padding:'8px', fontSize:'12px', color:'var(--mu)', borderBottom:'1px solid var(--bd)' }}>{lado}</div>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer">
                      <img src={url} alt={lado} style={{ width:'100%', maxHeight:'160px', objectFit:'cover', display:'block' }}
                        onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='block'; }}/>
                      <div style={{ display:'none', padding:'16px', textAlign:'center', fontSize:'12px', color:'var(--mu)' }}>
                        📄 Clique para abrir
                      </div>
                    </a>
                  ) : (
                    <div style={{ padding:'20px', textAlign:'center', fontSize:'12px', color:'var(--mu)' }}>
                      Não enviado
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:'10px' }}>
              <button className="btn btn-success" style={{ flex:1 }}
                onClick={() => { setModal(null); setConfirm({id:selected.id, nome:selected.nome}); }}>
                ✓ Aprovar
              </button>
              <button className="btn btn-danger" style={{ flex:1 }}
                onClick={() => setModal('rejeitar')}>
                ✗ Rejeitar
              </button>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REJEITAR */}
      {modal==='rejeitar' && selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:200,
          display:'flex', alignItems:'flex-end', justifyContent:'center' }}
          onClick={() => { setModal(null); setMotivo(''); }}>
          <div onClick={e=>e.stopPropagation()} style={{
            background:'var(--s)', borderRadius:'20px 20px 0 0',
            width:'100%', maxWidth:'500px', padding:'20px',
          }}>
            <div style={{ width:'36px', height:'4px', background:'var(--bd)', borderRadius:'2px', margin:'0 auto 16px' }}/>
            <h3 style={{ fontFamily:'Syne,sans-serif', marginBottom:'8px' }}>Rejeitar cadastro</h3>
            <p style={{ fontSize:'13px', color:'var(--mu)', marginBottom:'16px' }}>
              Informe o motivo. O morador receberá um e-mail explicando a decisão.
            </p>
            <div className="form-group">
              <label className="form-label">Motivo da rejeição *</label>
              <textarea className="form-control" rows={3} value={motivo}
                onChange={e=>setMotivo(e.target.value)}
                placeholder="Ex: Não encontramos o CPF informado na lista de moradores."/>
            </div>
            <div style={{ display:'flex', gap:'10px', marginTop:'16px' }}>
              <button className="btn btn-ghost" onClick={() => { setModal(null); setMotivo(''); }}>Cancelar</button>
              <button className="btn btn-danger" style={{ flex:1 }} onClick={rejeitar}>✗ Confirmar rejeição</button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM APROVAR */}
      <ConfirmDialog open={!!confirm}
        title="Aprovar cadastro?"
        message={`Aprovar o cadastro de "${confirm?.nome}"? Um e-mail será enviado com as credenciais de acesso.`}
        onConfirm={() => { aprovar(confirm.id, confirm.nome); setConfirm(null); }}
        onCancel={() => setConfirm(null)}
      />
    </Layout>
  );
}
