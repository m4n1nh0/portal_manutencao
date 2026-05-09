import { useState, useEffect, useCallback } from 'react';
import Layout from '../components/Layout';
import { EmptyState, StatusBadge, PrioBadge, SectorTag, Spinner, ConfirmDialog } from '../components/UI';
import PhotosPanel from './PhotosPanel';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import api from '../utils/api';
import { addDays, formatDate, paramsForPeriod, PERIOD_OPTIONS, rangeFor, today } from '../utils/dateFilters';

const CYCLE_LABELS = { diario:'Diario', semanal:'Semanal', mensal:'Mensal', anual:'Anual', todas:'Todas' };

const TITLES = { diario:'Manutenção Diária', semanal:'Manutenção Semanal', mensal:'Manutenção Mensal', anual:'Manutenção Anual' };

export default function TaskList({ ciclo }) {
  const { user }  = useAuth();
  const toast     = useToast();
  const perms     = user?.permissoes || {};

  const [tarefas,   setTarefas]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [fSetor,    setFSetor]    = useState('Todos');
  const [fPrio,     setFPrio]     = useState('');
  const [fStatus,   setFStatus]   = useState('');
  const [busca,     setBusca]     = useState('');
  const [periodo,   setPeriodo]   = useState('todos');
  const [inicio,    setInicio]    = useState(today());
  const [fim,       setFim]       = useState(addDays(7));
  const [editId,    setEditId]    = useState(null);
  const [confirm,   setConfirm]   = useState(null);
  const [fotasTarefa, setFotos]   = useState(null);
  const [showForm,  setShowForm]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { tarefas } = await api.tarefas({ ciclo, ...paramsForPeriod(periodo, inicio, fim) });
      setTarefas(tarefas);
    } catch(e) { toast(e.message,'error'); }
    finally { setLoading(false); }
  }, [ciclo, periodo, inicio, fim]);

  useEffect(() => { load(); }, [load]);

  // ── Filtros ──────────────────────────────────────────────────
  const setores = ['Todos', ...Array.from(new Set(tarefas.map(r=>r.setor))).sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true}))];
  let rows = tarefas;
  if (fSetor !== 'Todos') rows = rows.filter(r=>r.setor===fSetor);
  if (fPrio)   rows = rows.filter(r=>r.prioridade===fPrio);
  if (fStatus) rows = rows.filter(r=>r.status===fStatus);
  if (busca)   rows = rows.filter(r=>(r.atividade+r.setor+r.equipe).toLowerCase().includes(busca.toLowerCase()));

  function changePeriodo(value) {
    setPeriodo(value);
    if (value !== 'todos' && value !== 'custom') {
      const [nextInicio, nextFim] = rangeFor(value);
      setInicio(nextInicio);
      setFim(nextFim);
    }
  }

  // ── Ações ────────────────────────────────────────────────────
  async function patchStatus(id, status) {
    try {
      await api.patchStatus(id, status);
      setTarefas(p => p.map(t => t.id===id ? {...t, status} : t));
      toast(status==='Concluído' ? '✅ Concluída!' : '↩ Reaberta.','success');
    } catch(e) { toast(e.message,'error'); }
  }

  async function deleteTask(id) {
    try {
      await api.deletarTarefa(id);
      setTarefas(p => p.filter(t=>t.id!==id));
      toast('Tarefa excluída.','info');
    } catch(e) { toast(e.message,'error'); }
  }

  // ── Prioridade → classe CSS ──────────────────────────────────
  const prioClass = { Alta:'prio-alta-card', Média:'prio-media-card', Baixa:'prio-baixa-card' };

  return (
    <Layout title={TITLES[ciclo]}>
      {/* Filtros */}
      <div className="page-filters">
        {ciclo==='diario' && (
          <div className="filter-chips">
            {setores.map(s => (
              <button key={s} className={`filter-chip${fSetor===s?' active':''}`}
                onClick={() => setFSetor(s)}>{s}</button>
            ))}
          </div>
        )}
        <div className="date-filter-row">
          <div className="filter-chips no-scroll">
            {PERIOD_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={`filter-chip${periodo === value ? ' active' : ''}`}
                onClick={() => changePeriodo(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            className="filter-select date-input"
            type="date"
            value={inicio}
            disabled={periodo === 'todos'}
            onChange={(e) => { setPeriodo('custom'); setInicio(e.target.value); }}
          />
          <input
            className="filter-select date-input"
            type="date"
            value={fim}
            disabled={periodo === 'todos'}
            onChange={(e) => { setPeriodo('custom'); setFim(e.target.value); }}
          />
        </div>
        <div className="filter-row">
          <select className="filter-select" value={fPrio} onChange={e=>setFPrio(e.target.value)}>
            <option value="">Prioridade</option>
            <option>Alta</option><option>Média</option><option>Baixa</option>
          </select>
          <select className="filter-select" value={fStatus} onChange={e=>setFStatus(e.target.value)}>
            <option value="">Status</option>
            <option>Pendente</option><option>Concluído</option>
            <option>Em Andamento</option><option>Em Revisão</option>
          </select>
          <input className="filter-select" type="text" placeholder="🔍 Buscar…"
            value={busca} onChange={e=>setBusca(e.target.value)}
            style={{ minWidth:'120px' }}/>
          <button className="btn-icon" onClick={() => api.tarefas({ciclo, ...paramsForPeriod(periodo, inicio, fim)}).then(({tarefas:ts})=>exportCSV(ts,ciclo))}
            title="Exportar CSV">⬇</button>
          {perms.canAdd && (
            <button className="btn btn-primary btn-sm" onClick={() => { setEditId(null); setShowForm(true); }}>
              + Nova
            </button>
          )}
        </div>
      </div>

      {loading ? <Spinner/> : rows.length===0 ? (
        <EmptyState icon="📭" title="Nenhuma tarefa" desc="Ajuste os filtros ou adicione uma tarefa."/>
      ) : (
        <div className="task-list">
          {rows.map(r => {
            const done = r.status === 'Concluído';
            return (
              <div key={r.id} className={`task-card ${prioClass[r.prioridade]||''} ${done?'task-done':''}`}>
                <div className="task-card-top">
                  <div className="task-card-title">{r.atividade}</div>
                  <StatusBadge status={r.status}/>
                </div>
                <div className="task-card-meta">
                  <SectorTag setor={r.setor}/>
                  {r.area && <span className="muted-sm">{r.area}</span>}
                  {r.ciclo === 'todas' && <span className="muted-sm">{CYCLE_LABELS.todas}</span>}
                  {r.equipe && <span className="muted-sm">• {r.equipe}</span>}
                  {r.data_agendada && <span className="muted-sm">Ag. {formatDate(r.data_agendada)}</span>}
                  {r.data_limite && <span className="muted-sm">Lim. {formatDate(r.data_limite)}</span>}
                  <PrioBadge p={r.prioridade}/>
                </div>
                {r.observacoes && <div className="task-obs">💬 {r.observacoes}</div>}
                <div className="task-actions">
                  {perms.canEdit && (
                    done
                      ? <button className="btn btn-warning btn-sm" onClick={()=>patchStatus(r.id,'Pendente')}>↩ Reabrir</button>
                      : <button className="btn btn-success btn-sm" onClick={()=>patchStatus(r.id,'Concluído')}>✓ Concluir</button>
                  )}
                  {perms.canEdit && (
                    <button className="btn btn-ghost btn-sm" onClick={()=>{ setEditId(r.id); setShowForm(true); }}>✏</button>
                  )}
                  {perms.canDelete && (
                    <button className="btn btn-danger btn-sm" onClick={()=>setConfirm(r.id)}>🗑</button>
                  )}
                  <button className="btn btn-photo btn-sm" onClick={()=>setFotos(r)}>
                    📷 Fotos
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL TAREFA */}
      {showForm && (
        <TaskForm ciclo={ciclo} tarefaId={editId} tarefas={tarefas}
          onClose={() => setShowForm(false)}
          onSaved={(t) => {
            setTarefas(p => {
              const semAtual = p.filter(x => x.id !== t.id);
              return (t.ciclo === ciclo || t.ciclo === 'todas') ? [...semAtual, t] : semAtual;
            });
            setShowForm(false);
            toast(editId?'Tarefa atualizada!':'Tarefa criada!','success');
          }}/>
      )}

      {/* FOTOS */}
      {fotasTarefa && (
        <PhotosPanel tarefa={fotasTarefa} onClose={() => setFotos(null)}/>
      )}

      {/* CONFIRM DELETE */}
      <ConfirmDialog open={!!confirm} danger
        title="Excluir tarefa?" message="Esta ação não pode ser desfeita."
        onConfirm={() => { deleteTask(confirm); setConfirm(null); }}
        onCancel={() => setConfirm(null)}/>
    </Layout>
  );
}

// ── TaskForm ─────────────────────────────────────────────────
function TaskForm({ ciclo, tarefaId, tarefas, onClose, onSaved }) {
  const toast = useToast();
  const tarefa = tarefas?.find(t=>t.id===tarefaId);
  const [form, setForm] = useState({
    ciclo:      tarefa?.ciclo      || ciclo,
    setor:      tarefa?.setor      || '',
    area:       tarefa?.area       || '',
    atividade:  tarefa?.atividade  || '',
    equipe:     tarefa?.equipe     || '',
    prioridade: tarefa?.prioridade || 'Média',
    status:     tarefa?.status     || 'Pendente',
    observacoes:tarefa?.observacoes|| '',
    data_agendada: tarefa?.data_agendada ? String(tarefa.data_agendada).slice(0, 10) : today(),
    data_limite: tarefa?.data_limite ? String(tarefa.data_limite).slice(0, 10) : '',
  });
  const [loading, setLoading] = useState(false);
  const set = (k,v) => setForm(p=>({...p,[k]:v}));

  async function save(e) {
    e.preventDefault();
    if (!form.setor.trim()||!form.atividade.trim()) { toast('Setor e atividade obrigatórios.','error'); return; }
    setLoading(true);
    try {
      const payload = {
        ...form,
        data_agendada: form.data_agendada || null,
        data_limite: form.data_limite || null,
      };
      const res = tarefaId
        ? await api.editarTarefa(tarefaId, payload)
        : await api.criarTarefa(payload);
      onSaved(res.tarefa);
    } catch(e) { toast(e.message,'error'); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:200,
      display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{
        background:'var(--s)', borderRadius:'20px 20px 0 0',
        width:'100%', maxWidth:'600px', maxHeight:'92vh', overflowY:'auto',
        paddingBottom:'calc(16px + env(safe-area-inset-bottom))',
        animation:'slideUp .3s cubic-bezier(.16,1,.3,1)',
      }}>
        <div style={{ width:'36px', height:'4px', background:'var(--bd)', borderRadius:'2px', margin:'12px auto 4px' }}/>
        <div style={{ fontFamily:'Syne,sans-serif', fontSize:'18px', fontWeight:700, padding:'8px 20px 0' }}>
          {tarefaId ? 'Editar Tarefa' : 'Nova Tarefa'}
        </div>
        <form onSubmit={save} style={{ padding:'16px 20px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <div className="form-group">
              <label className="form-label">Frequencia</label>
              <select className="form-control" value={form.ciclo} onChange={e=>set('ciclo',e.target.value)}>
                <option value="diario">Diário</option><option value="semanal">Semanal</option>
                <option value="mensal">Mensal</option><option value="anual">Anual</option><option value="todas">Todas</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Setor *</label>
              <input className="form-control" value={form.setor} onChange={e=>set('setor',e.target.value)} placeholder="Ex: S1, Geral…"/>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Área / Trecho</label>
            <input className="form-control" value={form.area} onChange={e=>set('area',e.target.value)} placeholder="Ex: Piscinas, Áreas verdes…"/>
          </div>
          <div className="form-group">
            <label className="form-label">Atividade *</label>
            <input className="form-control" value={form.atividade} onChange={e=>set('atividade',e.target.value)} placeholder="Descreva a atividade…"/>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <div className="form-group">
              <label className="form-label">Data agendada</label>
              <input className="form-control" type="date" value={form.data_agendada} onChange={e=>set('data_agendada',e.target.value)}/>
            </div>
            <div className="form-group">
              <label className="form-label">Data limite</label>
              <input className="form-control" type="date" value={form.data_limite} onChange={e=>set('data_limite',e.target.value)}/>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <div className="form-group">
              <label className="form-label">Responsável</label>
              <input className="form-control" value={form.equipe} onChange={e=>set('equipe',e.target.value)} placeholder="Ex: Equipe Limpeza"/>
            </div>
            <div className="form-group">
              <label className="form-label">Prioridade</label>
              <select className="form-control" value={form.prioridade} onChange={e=>set('prioridade',e.target.value)}>
                <option>Alta</option><option>Média</option><option>Baixa</option>
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={e=>set('status',e.target.value)}>
                <option>Pendente</option><option>Em Andamento</option><option>Concluído</option><option>Em Revisão</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Observações</label>
              <input className="form-control" value={form.observacoes} onChange={e=>set('observacoes',e.target.value)} placeholder="Opcional…"/>
            </div>
          </div>
          <div style={{ display:'flex', gap:'10px', marginTop:'8px' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" style={{ flex:1 }} disabled={loading}>
              {loading ? '⏳' : '💾 Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function exportCSV(tarefas, ciclo) {
  const cols = ['setor','area','atividade','equipe','prioridade','status','data_agendada','data_limite','observacoes'];
  const hdr  = 'Setor,Area,Atividade,Responsavel,Prioridade,Status,Data agendada,Data limite,Observacoes';
  const rows = tarefas.map(r => cols.map(k=>`"${(r[k]||'').replace(/"/g,'""')}"`).join(','));
  const a    = document.createElement('a');
  a.href     = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent([hdr,...rows].join('\n'));
  a.download = `manutencao_${ciclo}_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}
