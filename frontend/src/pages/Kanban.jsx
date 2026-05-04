import { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import { SectorTag, PrioBadge, Spinner } from '../components/UI';
import api from '../utils/api';

export default function Kanban() {
  const [tarefas, setTarefas] = useState([]);
  const [filter,  setFilter]  = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.tarefas();
        setTarefas(res.tarefas || []);
      } catch(e) { console.error(e); }
      finally { setLoading(false); }
    })();
  }, []);

  const items = filter === 'all' ? tarefas : tarefas.filter(t => t.ciclo === filter || t.ciclo === 'todas');
  const pend  = items.filter(t => t.status === 'Pendente' || t.status === 'Em Andamento');
  const alta  = items.filter(t => t.prioridade === 'Alta' && t.status !== 'Concluído');
  const done  = items.filter(t => t.status === 'Concluído');

  const col = (title, color, rows) => (
    <div className="k-col">
      <div className="k-col-header">
        <span className="k-dot" style={{background: color}}/>
        <span>{title}</span>
        <span className="k-count">{rows.length}</span>
      </div>
      {rows.slice(0, 20).map(r => (
        <div key={r.id} className="k-card">
          <div className="k-card-title">{r.atividade}</div>
          <div className="k-card-meta">
            <SectorTag setor={r.setor}/>
            {r.ciclo === 'todas' && <span className="muted-sm">Todas</span>}
            <PrioBadge p={r.prioridade}/>
          </div>
        </div>
      ))}
      {rows.length > 20 && <div className="k-more">+{rows.length - 20} mais</div>}
    </div>
  );

  return (
    <Layout title="Kanban">
      <div className="tab-row">
        {[['all','Todos'],['diario','Diário'],['semanal','Semanal'],['mensal','Mensal'],['anual','Anual']].map(([v,l]) => (
          <button key={v} className={`tab${filter === v ? ' active' : ''}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      {loading ? <Spinner/> : (
        <div className="kanban-scroll">
          <div className="kanban-board">
            {col('Pendentes',   'var(--acc)', pend)}
            {col('Alta Prior.', 'var(--red)', alta)}
            {col('Concluídos',  'var(--grn)', done)}
          </div>
        </div>
      )}
    </Layout>
  );
}
