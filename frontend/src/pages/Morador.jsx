import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { Spinner, InfoBox, ProgressBar, SectorTag } from '../components/UI';
import { useToast } from '../hooks/useToast';
import api from '../utils/api';

export default function Morador() {
  const toast = useToast();
  const [tarefas,  setTarefas]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [obsSetor, setObsSetor] = useState(null);
  const [obsMsg,   setObsMsg]   = useState('');

  useEffect(() => {
    api.tarefas({ ciclo: 'diario' })
      .then(r => setTarefas(r.tarefas))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const grupos = {};
  tarefas.forEach(r => {
    if (!grupos[r.setor]) grupos[r.setor] = { total: 0, done: 0, items: [] };
    grupos[r.setor].total++;
    if (r.status === 'Concluído') grupos[r.setor].done++;
    grupos[r.setor].items.push(r);
  });

  async function sendObs() {
    if (!obsMsg.trim()) return;
    try {
      await api.criarObs({ setor: obsSetor, mensagem: obsMsg });
      toast('Observação enviada!', 'success');
      setObsSetor(null);
      setObsMsg('');
    } catch(e) { toast(e.message, 'error'); }
  }

  return (
    <Layout title="Status do Dia">
      <InfoBox>👋 Acompanhe as atividades de manutenção do condomínio de hoje.</InfoBox>
      {loading ? <Spinner/> : (
        <div className="morador-grid">
          {Object.entries(grupos).map(([setor, g]) => {
            const pct  = Math.round(g.done / g.total * 100);
            const dot  = pct === 100 ? 'var(--grn)' : pct > 0 ? 'var(--acc)' : 'var(--mu)';
            const fill = pct === 100 ? 'var(--grn)' : 'var(--acc)';
            return (
              <div key={setor} className="m-card">
                <div className="m-card-top">
                  <div>
                    <SectorTag setor={setor}/>
                    <div className="m-progress-label">{g.done}/{g.total} concluídas</div>
                  </div>
                  <div className="m-dot" style={{background: dot}}/>
                </div>
                <ProgressBar done={g.done} total={g.total} color={fill}/>
                <div className="m-items">
                  {g.items.slice(0, 3).map(i => `• ${i.atividade}`).join('\n')}
                </div>
                <div className="m-footer">
                  <button className="btn btn-ghost btn-sm" onClick={() => setObsSetor(setor)}>
                    💬 Observação
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal observação */}
      {obsSetor && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:200,
          display:'flex',alignItems:'flex-end',justifyContent:'center'}}
          onClick={() => setObsSetor(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background:'var(--s)',borderRadius:'20px 20px 0 0',
            width:'100%',maxWidth:'440px',padding:'20px',
            paddingBottom:'calc(20px + env(safe-area-inset-bottom))',
          }}>
            <div style={{width:'36px',height:'4px',background:'var(--bd)',borderRadius:'2px',margin:'0 auto 16px'}}/>
            <h3 style={{fontFamily:'Syne,sans-serif',marginBottom:'12px'}}>
              Observação — {obsSetor}
            </h3>
            <textarea className="form-control" rows={4} value={obsMsg}
              onChange={e => setObsMsg(e.target.value)}
              placeholder="Descreva o que observou…"/>
            <div style={{display:'flex',gap:'10px',marginTop:'14px'}}>
              <button className="btn btn-ghost" onClick={() => setObsSetor(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{flex:1}} onClick={sendObs}>Enviar</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
