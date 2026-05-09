import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { ConfirmDialog, EmptyState, Spinner, SectorTag } from '../components/UI';
import { useToast } from '../hooks/useToast';
import api from '../utils/api';

const TABS = [
  { id: 'ciclo', label: 'Ciclo' },
  { id: 'equipes', label: 'Responsaveis' },
  { id: 'locais', label: 'Areas/Locais' },
  { id: 'modelos', label: 'Modelos' },
];

const CICLO_LABELS = { diario: 'Diario', semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual', todas: 'Todas' };
const EMPTY_ATIVIDADE = { titulo: '', descricao: '', equipe: '', prioridade: '', ativo: true };
const emptyCiclo = (dia = 1) => ({ dia_ciclo: dia, setor: '', trecho: '', atividades: [{ ...EMPTY_ATIVIDADE }] });
const EMPTY_EQUIPE = { nome: '', tipo: '', contato: '', ativo: true };
const EMPTY_LOCAL = { nome: '', categoria: '', descricao: '', ativo: true };
const EMPTY_MODELO = { ciclo: 'diario', setor: '', area: '', atividade: '', equipe: '', prioridade: '', ativo: true };

export default function Cadastros() {
  const toast = useToast();
  const [tab, setTab] = useState('ciclo');
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [ciclo, setCiclo] = useState([]);
  const [equipes, setEquipes] = useState([]);
  const [locais, setLocais] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [form, setForm] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const [c, e, l, m] = await Promise.all([
        api.ciclo(),
        api.equipes(),
        api.locais(),
        api.modelosTarefas(),
      ]);
      setCiclo(c.ciclo || []);
      setEquipes(e.equipes || []);
      setLocais(l.locais || []);
      setModelos(m.modelos || []);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const keep = (text) => !q || text.toLowerCase().includes(q);
    if (tab === 'ciclo') return ciclo.filter((x) => keep(`${x.dia_ciclo} ${x.setor} ${x.trecho} ${(x.atividades || []).map((a) => `${a.titulo} ${a.descricao} ${a.equipe}`).join(' ')}`));
    if (tab === 'equipes') return equipes.filter((x) => keep(`${x.nome} ${x.tipo} ${x.contato}`));
    if (tab === 'locais') return locais.filter((x) => keep(`${x.nome} ${x.categoria} ${x.descricao}`));
    return modelos.filter((x) => keep(`${x.ciclo} ${x.setor} ${x.area} ${x.atividade} ${x.equipe}`));
  }, [busca, ciclo, equipes, locais, modelos, tab]);

  function newItem() {
    if (tab === 'ciclo') {
      const nextDay = Math.max(0, ...ciclo.map((item) => Number(item.dia_ciclo) || 0)) + 1;
      setForm({ type: 'ciclo', data: emptyCiclo(nextDay) });
    }
    if (tab === 'equipes') setForm({ type: 'equipe', data: EMPTY_EQUIPE });
    if (tab === 'locais') setForm({ type: 'local', data: EMPTY_LOCAL });
    if (tab === 'modelos') setForm({ type: 'modelo', data: EMPTY_MODELO });
  }

  function editItem(type, data) {
    if (type === 'ciclo') {
      const atividades = Array.isArray(data.atividades) && data.atividades.length
        ? data.atividades.map((atividade, index) => ({
            ...EMPTY_ATIVIDADE,
            ...atividade,
            ordem: atividade.ordem || index + 1,
            ativo: atividade.ativo === true || atividade.ativo === 1 || atividade.ativo === '1',
          }))
        : [{ ...EMPTY_ATIVIDADE }];
      setForm({ type, data: { ...data, atividades } });
      return;
    }
    const ativo = data.ativo === undefined || data.ativo === null
      ? true
      : data.ativo === true || data.ativo === 1 || data.ativo === '1';
    setForm({ type, data: { ...data, ativo } });
  }

  async function save(e) {
    e.preventDefault();
    const { type, data } = form;
    try {
      if (type === 'ciclo') data.id ? await api.editarCiclo(data.id, data) : await api.criarCiclo(data);
      if (type === 'equipe') data.id ? await api.editarEquipe(data.id, data) : await api.criarEquipe(data);
      if (type === 'local') data.id ? await api.editarLocal(data.id, data) : await api.criarLocal(data);
      if (type === 'modelo') data.id ? await api.editarModeloTarefa(data.id, data) : await api.criarModeloTarefa(data);
      toast('Cadastro salvo.', 'success');
      setForm(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function removeItem() {
    try {
      if (confirm.type === 'ciclo') await api.deletarCiclo(confirm.id);
      if (confirm.type === 'equipe') await api.deletarEquipe(confirm.id);
      if (confirm.type === 'local') await api.deletarLocal(confirm.id);
      if (confirm.type === 'modelo') await api.deletarModeloTarefa(confirm.id);
      toast('Cadastro removido.', 'info');
      setConfirm(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <Layout title="Cadastros">
      <div className="filter-chips" style={{ marginBottom: '14px' }}>
        {TABS.map((t) => (
          <button key={t.id} className={`filter-chip${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="filter-row" style={{ marginBottom: '16px' }}>
        <input className="filter-select" type="text" placeholder="Buscar..."
          value={busca} onChange={(e) => setBusca(e.target.value)} style={{ minWidth: '220px' }} />
        <button className="btn btn-primary btn-sm" onClick={newItem}>+ Novo</button>
        <button className="btn btn-ghost btn-sm" onClick={load}>Atualizar</button>
      </div>

      {loading ? <Spinner /> : filtered.length === 0 ? (
        <EmptyState icon="+" title="Nenhum cadastro" desc="Ajuste a busca ou adicione um novo item." />
      ) : (
        <div className="task-list">
          {tab === 'ciclo' && filtered.map((item) => (
            <Card key={item.id} title={`Dia ${item.dia_ciclo} - ${item.trecho || item.setor}`}
              meta={<><SectorTag setor={item.setor} /><span className="muted-sm">{(item.atividades || []).filter((a) => a.ativo).length} atividade(s)</span></>}
              actions={<CrudActions onEdit={() => editItem('ciclo', item)} onDelete={() => setConfirm({ type: 'ciclo', id: item.id, nome: `Dia ${item.dia_ciclo}` })} />}>
              <div className="ciclo-details">
                {(item.atividades || []).length ? item.atividades.map((atividade) => (
                  <div key={atividade.id || `${item.id}-${atividade.ordem}`} className="ciclo-detail-row">
                    <strong>{atividade.titulo}</strong>
                    <span>{atividade.descricao}</span>
                  </div>
                )) : '-'}
              </div>
            </Card>
          ))}

          {tab === 'equipes' && filtered.map((item) => (
            <Card key={item.id} title={item.nome}
              meta={<><span className="muted-sm">{item.tipo || 'Sem tipo'}</span><span className="muted-sm">{item.ativo ? 'Ativo' : 'Inativo'}</span></>}
              actions={<CrudActions onEdit={() => editItem('equipe', item)} onDelete={() => setConfirm({ type: 'equipe', id: item.id, nome: item.nome })} />}>
              {item.contato && <div className="muted-sm">{item.contato}</div>}
            </Card>
          ))}

          {tab === 'locais' && filtered.map((item) => (
            <Card key={item.id} title={item.nome}
              meta={<><span className="muted-sm">{item.categoria || 'Sem categoria'}</span><span className="muted-sm">{item.ativo ? 'Ativo' : 'Inativo'}</span></>}
              actions={<CrudActions onEdit={() => editItem('local', item)} onDelete={() => setConfirm({ type: 'local', id: item.id, nome: item.nome })} />}>
              {item.descricao && <div className="muted-sm">{item.descricao}</div>}
            </Card>
          ))}

          {tab === 'modelos' && filtered.map((item) => (
            <Card key={item.id} title={item.atividade}
              meta={<><SectorTag setor={item.setor} /><span className="muted-sm">{CICLO_LABELS[item.ciclo] || item.ciclo}</span><span className="muted-sm">{item.ativo ? 'Ativo' : 'Inativo'}</span></>}
              actions={<CrudActions onEdit={() => editItem('modelo', item)} onDelete={() => setConfirm({ type: 'modelo', id: item.id, nome: item.atividade })} />}>
              <div className="muted-sm">{item.area || 'Sem area'} {item.equipe ? `- ${item.equipe}` : ''}</div>
            </Card>
          ))}
        </div>
      )}

      {form && (
        <Modal title={modalTitle(form)} onClose={() => setForm(null)}>
          <form onSubmit={save}>
            {form.type === 'ciclo' && <CicloForm form={form.data} setForm={setFormData(setForm)} />}
            {form.type === 'equipe' && <EquipeForm form={form.data} setForm={setFormData(setForm)} />}
            {form.type === 'local' && <LocalForm form={form.data} setForm={setFormData(setForm)} />}
            {form.type === 'modelo' && <ModeloForm form={form.data} setForm={setFormData(setForm)} />}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Salvar</button>
            </div>
          </form>
        </Modal>
      )}

      <ConfirmDialog open={!!confirm} danger
        title="Remover cadastro?"
        message={`Remover "${confirm?.nome}"?`}
        onConfirm={removeItem}
        onCancel={() => setConfirm(null)}
      />
    </Layout>
  );
}

function Card({ title, meta, actions, children }) {
  return (
    <div className="task-card">
      <div className="task-card-top">
        <div className="task-card-title">{title}</div>
      </div>
      <div className="task-card-meta">{meta}</div>
      {children}
      <div className="task-actions">{actions}</div>
    </div>
  );
}

function CrudActions({ onEdit, onDelete }) {
  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={onEdit}>Editar</button>
      <button className="btn btn-danger btn-sm" onClick={onDelete}>Remover</button>
    </>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--s)', borderRadius: '20px 20px 0 0',
        width: '100%', maxWidth: '640px', maxHeight: '92vh', overflowY: 'auto',
        padding: '20px', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ width: '36px', height: '4px', background: 'var(--bd)', borderRadius: '2px', margin: '0 auto 14px' }} />
        <h3 style={{ fontFamily: 'Syne,sans-serif', marginBottom: '14px' }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function setFormData(setForm) {
  return (patch) => setForm((prev) => ({ ...prev, data: { ...prev.data, ...patch } }));
}

function modalTitle(form) {
  if (form.type === 'ciclo') return form.data.id ? 'Editar dia do ciclo' : 'Novo dia do ciclo';
  if (form.type === 'equipe') return form.data.id ? 'Editar responsavel' : 'Novo responsavel';
  if (form.type === 'local') return form.data.id ? 'Editar area/local' : 'Nova area/local';
  return form.data.id ? 'Editar modelo' : 'Novo modelo';
}

function Field({ label, children }) {
  return <div className="form-group"><label className="form-label">{label}</label>{children}</div>;
}

function ActiveField({ form, setForm }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '8px 0 14px' }}>
      <input type="checkbox" checked={!!form.ativo} onChange={(e) => setForm({ ativo: e.target.checked })} />
      Ativo
    </label>
  );
}

function CicloForm({ form, setForm }) {
  const atividades = Array.isArray(form.atividades) && form.atividades.length
    ? form.atividades
    : [{ ...EMPTY_ATIVIDADE }];

  function setAtividade(index, patch) {
    const next = atividades.map((item, idx) => idx === index ? { ...item, ...patch } : item);
    setForm({ atividades: next });
  }

  function addAtividade() {
    setForm({ atividades: [...atividades, { ...EMPTY_ATIVIDADE, ordem: atividades.length + 1 }] });
  }

  function removeAtividade(index) {
    const next = atividades.filter((_, idx) => idx !== index);
    setForm({ atividades: next.length ? next : [{ ...EMPTY_ATIVIDADE }] });
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px' }}>
        <Field label="Dia"><input className="form-control" type="number" min="1" value={form.dia_ciclo} onChange={(e) => setForm({ dia_ciclo: e.target.value })} required /></Field>
        <Field label="Setor"><input className="form-control" value={form.setor || ''} onChange={(e) => setForm({ setor: e.target.value })} required /></Field>
      </div>
      <Field label="Trecho"><input className="form-control" value={form.trecho || ''} onChange={(e) => setForm({ trecho: e.target.value })} /></Field>
      <div className="cycle-activity-editor">
        <div className="cycle-activity-head">
          <span>Atividades</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addAtividade}>+ Atividade</button>
        </div>
        {atividades.map((atividade, index) => (
          <div key={atividade.id || index} className="cycle-activity-row">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '10px' }}>
              <Field label="Titulo">
                <input className="form-control" value={atividade.titulo || ''} onChange={(e) => setAtividade(index, { titulo: e.target.value })} required />
              </Field>
              <Field label="Prioridade">
                <select className="form-control" value={atividade.prioridade || ''} onChange={(e) => setAtividade(index, { prioridade: e.target.value })}>
                  <option value="">Sem</option><option value="Alta">Alta</option><option value="Media">Media</option><option value="Baixa">Baixa</option>
                </select>
              </Field>
            </div>
            <Field label="Descricao">
              <textarea className="form-control" rows={2} value={atividade.descricao || ''} onChange={(e) => setAtividade(index, { descricao: e.target.value })} required />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'center' }}>
              <Field label="Responsavel">
                <input className="form-control" value={atividade.equipe || ''} onChange={(e) => setAtividade(index, { equipe: e.target.value })} />
              </Field>
              <label className="cycle-activity-check">
                <input type="checkbox" checked={!!atividade.ativo} onChange={(e) => setAtividade(index, { ativo: e.target.checked })} />
                Ativo
              </label>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => removeAtividade(index)}>Remover</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function EquipeForm({ form, setForm }) {
  return (
    <>
      <Field label="Nome"><input className="form-control" value={form.nome || ''} onChange={(e) => setForm({ nome: e.target.value })} required /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Field label="Tipo"><input className="form-control" value={form.tipo || ''} onChange={(e) => setForm({ tipo: e.target.value })} /></Field>
        <Field label="Contato"><input className="form-control" value={form.contato || ''} onChange={(e) => setForm({ contato: e.target.value })} /></Field>
      </div>
      <ActiveField form={form} setForm={setForm} />
    </>
  );
}

function LocalForm({ form, setForm }) {
  return (
    <>
      <Field label="Nome"><input className="form-control" value={form.nome || ''} onChange={(e) => setForm({ nome: e.target.value })} required /></Field>
      <Field label="Categoria"><input className="form-control" value={form.categoria || ''} onChange={(e) => setForm({ categoria: e.target.value })} /></Field>
      <Field label="Descricao"><input className="form-control" value={form.descricao || ''} onChange={(e) => setForm({ descricao: e.target.value })} /></Field>
      <ActiveField form={form} setForm={setForm} />
    </>
  );
}

function ModeloForm({ form, setForm }) {
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Field label="Frequencia">
          <select className="form-control" value={form.ciclo || 'diario'} onChange={(e) => setForm({ ciclo: e.target.value })}>
            <option value="diario">Diario</option><option value="semanal">Semanal</option><option value="mensal">Mensal</option><option value="anual">Anual</option><option value="todas">Todas</option>
          </select>
        </Field>
        <Field label="Setor"><input className="form-control" value={form.setor || ''} onChange={(e) => setForm({ setor: e.target.value })} required /></Field>
      </div>
      <Field label="Area/local"><input className="form-control" value={form.area || ''} onChange={(e) => setForm({ area: e.target.value })} /></Field>
      <Field label="Atividade"><input className="form-control" value={form.atividade || ''} onChange={(e) => setForm({ atividade: e.target.value })} required /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <Field label="Responsavel"><input className="form-control" value={form.equipe || ''} onChange={(e) => setForm({ equipe: e.target.value })} /></Field>
        <Field label="Prioridade">
          <select className="form-control" value={form.prioridade || ''} onChange={(e) => setForm({ prioridade: e.target.value })}>
            <option value="">Sem prioridade</option><option value="Alta">Alta</option><option value="Media">Media</option><option value="Baixa">Baixa</option>
          </select>
        </Field>
      </div>
      <ActiveField form={form} setForm={setForm} />
    </>
  );
}
