import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { EmptyState, Spinner, ProgressBar, SectorTag } from '../components/UI';
import { useToast } from '../hooks/useToast';
import api from '../utils/api';

export default function Morador() {
  const toast = useToast();
  const [tarefas,  setTarefas]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [erro,     setErro]     = useState('');
  const [obsSetor, setObsSetor] = useState(null);
  const [obsMsg,   setObsMsg]   = useState('');

  useEffect(() => {
    api.tarefas({ ciclo: 'diario' })
      .then(r => {
        setErro('');
        setTarefas(Array.isArray(r.tarefas) ? r.tarefas : []);
      })
      .catch(e => {
        setErro(e.message);
        toast(e.message, 'error');
      })
      .finally(() => setLoading(false));
  }, []);

  const grupos = {};
  tarefas.forEach(r => {
    if (!grupos[r.setor]) grupos[r.setor] = { total: 0, done: 0, items: [] };
    grupos[r.setor].total++;
    if (r.status === 'Concluído') grupos[r.setor].done++;
    grupos[r.setor].items.push(r);
  });

  const grupoEntries = Object.entries(grupos)
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR', { numeric: true }));
  const total = tarefas.length;
  const done = tarefas.filter((r) => r.status === 'Concluído').length;
  const pending = total - done;
  const pctTotal = total ? Math.round(done / total * 100) : 0;

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
      {loading ? <Spinner/> : erro ? (
        <EmptyState icon="!" title="Nao foi possivel carregar" desc={erro}/>
      ) : total === 0 ? (
        <EmptyState icon="MO" title="Nenhuma rotina publicada" desc="Quando a equipe publicar as atividades do dia, elas aparecem aqui."/>
      ) : (
        <>
          <section className="morador-summary">
            <div>
              <div className="morador-eyebrow">Hoje</div>
              <h2>Status das rotinas</h2>
              <p>{done} de {total} atividades concluidas</p>
            </div>
            <div className="morador-score" style={{ '--pct': `${pctTotal}%` }}>
              <span>{pctTotal}%</span>
            </div>
          </section>

          <div className="morador-metrics">
            <div><strong>{done}</strong><span>Concluidas</span></div>
            <div><strong>{pending}</strong><span>Em aberto</span></div>
            <div><strong>{grupoEntries.length}</strong><span>Setores</span></div>
          </div>

          <div className="morador-grid">
          {grupoEntries.map(([setor, g]) => {
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
                <ul className="m-items-list">
                  {g.items.slice(0, 4).map(i => (
                    <li key={i.id} className={i.status === 'Concluído' ? 'done' : ''}>
                      <span>{i.status === 'Concluído' ? 'OK' : '...'}</span>
                      <p>{i.atividade}</p>
                    </li>
                  ))}
                </ul>
                <div className="m-footer">
                  <button className="btn btn-ghost btn-sm" onClick={() => setObsSetor(setor)}>
                    Observacao
                  </button>
                </div>
              </div>
            );
          })}
          </div>
        </>
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
              Observacao - {obsSetor}
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
