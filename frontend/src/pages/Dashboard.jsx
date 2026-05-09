import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { Spinner, StatusBadge, SectorTag, ProgressBar, InfoBox } from '../components/UI';
import { useAuth } from '../hooks/useAuth';
import api from '../utils/api';
import { addDays, formatDate, paramsForPeriod, PERIOD_OPTIONS, rangeFor, today } from '../utils/dateFilters';

export default function Dashboard() {
  const { user }  = useAuth();
  const navigate  = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState('todos');
  const [inicio, setInicio] = useState(today());
  const [fim, setFim] = useState(addDays(7));

  useEffect(() => {
    setLoading(true);
    api.dashboard(paramsForPeriod(periodo, inicio, fim))
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [periodo, inicio, fim]);

  function changePeriodo(value) {
    setPeriodo(value);
    if (value !== 'todos' && value !== 'custom') {
      const [nextInicio, nextFim] = rangeFor(value);
      setInicio(nextInicio);
      setFim(nextFim);
    }
  }

  const clrs = { diario:'var(--acc)', semanal:'var(--grn)', mensal:'var(--blu)', anual:'var(--pur)', todas:'var(--tx)' };
  const lbls = { diario:'Diário', semanal:'Semanal', mensal:'Mensal', anual:'Anual', todas:'Todas' };

  if (loading || !data) return <Layout title="Dashboard"><Spinner/></Layout>;

  const totais  = data.totais || [];
  const total   = totais.reduce((s,r) => s + parseInt(r.total), 0);
  const done    = totais.reduce((s,r) => s + parseInt(r.concluidas), 0);
  const pend    = total - done;
  const alta    = totais.reduce((s,r) => s + parseInt(r.alta_pendente), 0);

  return (
    <Layout title="Dashboard" badges={{ aprovacoes: data.pendentes_aprovacao }}>
      <div className="date-filter-row">
        <div className="filter-chips no-scroll">
          {PERIOD_OPTIONS.map(([value, label]) => (
            <button key={value} type="button" className={`filter-chip${periodo === value ? ' active' : ''}`} onClick={() => changePeriodo(value)}>
              {label}
            </button>
          ))}
        </div>
        <input className="filter-select date-input" type="date" value={inicio} disabled={periodo === 'todos'} onChange={(e) => { setPeriodo('custom'); setInicio(e.target.value); }}/>
        <input className="filter-select date-input" type="date" value={fim} disabled={periodo === 'todos'} onChange={(e) => { setPeriodo('custom'); setFim(e.target.value); }}/>
      </div>

      {data.pendentes_aprovacao > 0 && (
        <InfoBox color="var(--acc)" bg="rgba(240,180,41,.07)" border="rgba(240,180,41,.2)">
          ⚠️ <strong>{data.pendentes_aprovacao}</strong> cadastro(s) de morador aguardando aprovação.{' '}
          <span style={{cursor:'pointer',textDecoration:'underline'}} onClick={() => navigate('/app/aprovacoes')}>
            Ver agora →
          </span>
        </InfoBox>
      )}

      <div className="stats-grid">
        <div className="stat-card stat-yellow">
          <div className="stat-label">Total</div>
          <div className="stat-value">{total}</div>
          <div className="stat-sub">tarefas</div>
        </div>
        <div className="stat-card stat-green">
          <div className="stat-label">Concluídas</div>
          <div className="stat-value" style={{color:'var(--grn)'}}>{done}</div>
          <div className="stat-sub">{total ? Math.round(done/total*100) : 0}%</div>
        </div>
        <div className="stat-card stat-red">
          <div className="stat-label">Pendentes</div>
          <div className="stat-value" style={{color:'var(--red)'}}>{pend}</div>
          <div className="stat-sub">aguardando</div>
        </div>
        <div className="stat-card stat-blue">
          <div className="stat-label">Alta Prior.</div>
          <div className="stat-value" style={{color:'var(--blu)'}}>{alta}</div>
          <div className="stat-sub">críticas</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card-title">Progresso por Ciclo</div>
          {totais.map(r => {
            const pct = r.total > 0 ? Math.round(r.concluidas/r.total*100) : 0;
            return (
              <div key={r.ciclo} className="progress-row">
                <div className="progress-labels">
                  <span>{lbls[r.ciclo] || r.ciclo}</span>
                  <span>{r.concluidas}/{r.total} ({pct}%)</span>
                </div>
                <ProgressBar done={parseInt(r.concluidas)} total={parseInt(r.total)} color={clrs[r.ciclo]}/>
              </div>
            );
          })}
        </div>
        <div className="card">
          <div className="card-title">Últimas Conclusões</div>
          {data.recentes?.length ? data.recentes.map(r => (
            <div key={r.id} className="rec-row">
              <SectorTag setor={r.setor}/>
              <span className="rec-title">{r.atividade}</span>
              <StatusBadge status={r.status}/>
            </div>
          )) : <div className="muted-center">Nenhuma conclusão ainda</div>}
        </div>
      </div>

      <div className="section-header"><h2 className="section-title">🔴 Alta Prioridade</h2></div>
      {data.alta?.length ? (
        <div className="task-list">
          {data.alta.map(r => (
            <div key={r.id} className="task-card prio-alta-card">
              <div className="task-card-top">
                <div className="task-card-title">{r.atividade}</div>
                <StatusBadge status={r.status}/>
              </div>
              <div className="task-card-meta">
                <SectorTag setor={r.setor}/>
                <span className="muted-sm">{lbls[r.ciclo] || r.ciclo}</span>
                {r.data_agendada && <span className="muted-sm">{formatDate(r.data_agendada)}</span>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{textAlign:'center',padding:'32px',color:'var(--mu)'}}>
          ✅ Nenhuma tarefa crítica pendente!
        </div>
      )}
    </Layout>
  );
}
