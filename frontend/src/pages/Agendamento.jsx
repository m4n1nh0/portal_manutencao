import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { EmptyState, PrioBadge, SectorTag, Spinner, StatusBadge } from '../components/UI';
import { useToast } from '../hooks/useToast';
import api from '../utils/api';
import { addDays, formatDate, today } from '../utils/dateFilters';

const CICLOS = [
  ['diario', 'Diario'],
  ['semanal', 'Semanal'],
  ['mensal', 'Mensal'],
  ['anual', 'Anual'],
  ['todas', 'Todas'],
];

function taskDate(tarefa) {
  return String(tarefa.data_agendada || tarefa.criado_em || '').slice(0, 10);
}

export default function Agendamento() {
  const toast = useToast();
  const [inicio, setInicio] = useState(today());
  const [fim, setFim] = useState(addDays(7));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tarefas, setTarefas] = useState([]);
  const [resumo, setResumo] = useState([]);
  const [form, setForm] = useState({
    data_agendada: today(),
    data_limite: today(),
    ciclos: ['diario'],
  });

  async function load(nextInicio = inicio, nextFim = fim) {
    setLoading(true);
    try {
      const res = await api.agendamentos({ data_inicio: nextInicio, data_fim: nextFim });
      setTarefas(res.tarefas || []);
      setResumo(res.resumo || []);
    } catch(e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function toggleCiclo(ciclo) {
    setForm((prev) => ({
      ...prev,
      ciclos: prev.ciclos.includes(ciclo)
        ? prev.ciclos.filter((item) => item !== ciclo)
        : [...prev.ciclos, ciclo],
    }));
  }

  async function gerar(e) {
    e.preventDefault();
    if (!form.ciclos.length) {
      toast('Selecione ao menos um ciclo.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await api.gerarAgendamento(form);
      toast(`${res.criadas} tarefa(s) agendada(s). ${res.ignoradas} ja existiam.`, 'success');
      setInicio(form.data_agendada);
      setFim(form.data_limite || form.data_agendada);
      await load(form.data_agendada, form.data_limite || form.data_agendada);
    } catch(e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  const grouped = useMemo(() => tarefas.reduce((acc, tarefa) => {
    const key = taskDate(tarefa);
    (acc[key] ||= []).push(tarefa);
    return acc;
  }, {}), [tarefas]);

  const dias = Object.keys(grouped).sort();
  const total = resumo.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const concluidas = resumo.reduce((sum, item) => sum + Number(item.concluidas || 0), 0);
  const pendentes = resumo.reduce((sum, item) => sum + Number(item.pendentes || 0), 0);

  return (
    <Layout title="Agendamento">
      <div className="schedule-grid">
        <form className="settings-card" onSubmit={gerar}>
          <div className="card-title">Nova agenda</div>
          <div className="schedule-form-grid">
            <div className="form-group">
              <label className="form-label">Data</label>
              <input
                className="form-control"
                type="date"
                value={form.data_agendada}
                onChange={(e) => setForm((p) => ({ ...p, data_agendada: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Limite</label>
              <input
                className="form-control"
                type="date"
                value={form.data_limite}
                onChange={(e) => setForm((p) => ({ ...p, data_limite: e.target.value }))}
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Ciclos</label>
            <div className="filter-chips no-scroll">
              {CICLOS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`filter-chip${form.ciclos.includes(value) ? ' active' : ''}`}
                  onClick={() => toggleCiclo(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Gerando...' : 'Gerar agenda'}
          </button>
        </form>

        <div className="settings-card">
          <div className="card-title">Periodo</div>
          <div className="schedule-form-grid">
            <div className="form-group">
              <label className="form-label">Inicio</label>
              <input className="form-control" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Fim</label>
              <input className="form-control" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          <button className="btn btn-ghost" type="button" onClick={() => load()}>
            Atualizar
          </button>
        </div>
      </div>

      <div className="schedule-summary">
        <div className="summary-pill">
          <span>Total</span>
          <strong>{total}</strong>
        </div>
        <div className="summary-pill">
          <span>Pendentes</span>
          <strong>{pendentes}</strong>
        </div>
        <div className="summary-pill">
          <span>Concluidas</span>
          <strong>{concluidas}</strong>
        </div>
      </div>

      {loading ? <Spinner/> : !dias.length ? (
        <EmptyState icon="AG" title="Agenda vazia" desc="Ajuste o periodo ou gere novas tarefas."/>
      ) : (
        <div className="schedule-days">
          {dias.map((dia) => (
            <section key={dia} className="schedule-day">
              <div className="schedule-day-head">
                <div>
                  <div className="schedule-day-date">{formatDate(dia)}</div>
                  <div className="muted-sm">{grouped[dia].length} tarefa(s)</div>
                </div>
              </div>
              <div className="task-list compact">
                {grouped[dia].map((tarefa) => (
                  <div key={tarefa.id} className="task-card">
                    <div className="task-card-top">
                      <div className="task-card-title">{tarefa.atividade}</div>
                      <StatusBadge status={tarefa.status}/>
                    </div>
                    <div className="task-card-meta">
                      <SectorTag setor={tarefa.setor}/>
                      {tarefa.area && <span className="muted-sm">{tarefa.area}</span>}
                      {tarefa.equipe && <span className="muted-sm">{tarefa.equipe}</span>}
                      {tarefa.data_limite && <span className="muted-sm">Limite {formatDate(tarefa.data_limite)}</span>}
                      <PrioBadge p={tarefa.prioridade}/>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Layout>
  );
}
