import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { ConfirmDialog, EmptyState, Spinner } from '../components/UI';
import { useToast } from '../hooks/useToast';
import api from '../utils/api';

const EMPTY_QUADRA = { codigo: '', nome: '', descricao: '' };

export default function QuadrasRuas() {
  const toast = useToast();
  const [quadras, setQuadras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [quadraForm, setQuadraForm] = useState(null);
  const [ruaForm, setRuaForm] = useState(null);
  const [confirm, setConfirm] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const { quadras } = await api.quadras();
      setQuadras(quadras);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return quadras;
    return quadras.filter((quadra) => {
      const ruas = (quadra.ruas || []).map((rua) => rua.nome).join(' ');
      return `${quadra.codigo} ${quadra.nome} ${ruas}`.toLowerCase().includes(q);
    });
  }, [busca, quadras]);

  function openQuadra(quadra) {
    setQuadraForm(quadra ? {
      id: quadra.id,
      codigo: quadra.codigo,
      nome: quadra.nome,
      descricao: quadra.descricao || '',
    } : EMPTY_QUADRA);
  }

  function openRua(quadra, rua) {
    setRuaForm({
      quadraId: quadra.id,
      quadraNome: quadra.nome,
      id: rua?.id || null,
      nome: rua?.nome || '',
      ordem: rua?.ordem || ((quadra.ruas?.length || 0) + 1),
    });
  }

  async function saveQuadra(e) {
    e.preventDefault();
    try {
      if (quadraForm.id) {
        await api.editarQuadra(quadraForm.id, quadraForm);
        toast('Quadra atualizada.', 'success');
      } else {
        await api.criarQuadra(quadraForm);
        toast('Quadra criada.', 'success');
      }
      setQuadraForm(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function saveRua(e) {
    e.preventDefault();
    const payload = { nome: ruaForm.nome, ordem: Number(ruaForm.ordem) };
    try {
      if (ruaForm.id) {
        await api.editarRua(ruaForm.id, payload);
        toast('Rua atualizada.', 'success');
      } else {
        await api.criarRua(ruaForm.quadraId, payload);
        toast('Rua criada.', 'success');
      }
      setRuaForm(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function handleDelete() {
    try {
      if (confirm.type === 'quadra') await api.deletarQuadra(confirm.id);
      if (confirm.type === 'rua') await api.deletarRua(confirm.id);
      toast(confirm.type === 'quadra' ? 'Quadra removida.' : 'Rua removida.', 'info');
      setConfirm(null);
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <Layout title="Quadras e Ruas">
      <div className="filter-row" style={{ marginBottom: '16px' }}>
        <input
          className="filter-select"
          type="text"
          placeholder="Buscar quadra ou rua..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ minWidth: '220px' }}
        />
        <button className="btn btn-primary btn-sm" onClick={() => openQuadra(null)}>
          + Nova quadra
        </button>
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="Q" title="Nenhuma quadra" desc="Cadastre a primeira quadra." />
      ) : (
        <div className="task-list">
          {rows.map((quadra) => (
            <div key={quadra.id} className="task-card">
              <div className="task-card-top">
                <div>
                  <div className="task-card-title">{quadra.nome}</div>
                  {quadra.descricao && <div className="muted-sm">{quadra.descricao}</div>}
                </div>
                <span className="stag">{quadra.ruas?.length || 0} rua(s)</span>
              </div>

              <div className="task-card-meta">
                <span className="muted-sm">Codigo: {quadra.codigo}</span>
                <span className="muted-sm">{quadra.ativo ? 'Ativa' : 'Inativa'}</span>
              </div>

              <div style={{ display: 'grid', gap: '8px', marginTop: '12px' }}>
                {(quadra.ruas || []).map((rua) => (
                  <div key={rua.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '8px 10px',
                    border: '1px solid var(--bd)',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,.02)',
                  }}>
                    <div>
                      <strong>{rua.nome}</strong>
                      <span className="muted-sm" style={{ marginLeft: '8px' }}>ordem {rua.ordem}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openRua(quadra, rua)}>Editar</button>
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ type: 'rua', id: rua.id, nome: rua.nome })}>Remover</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="task-actions">
                <button className="btn btn-primary btn-sm" onClick={() => openRua(quadra)}>+ Rua</button>
                <button className="btn btn-ghost btn-sm" onClick={() => openQuadra(quadra)}>Editar quadra</button>
                <button className="btn btn-danger btn-sm" onClick={() => setConfirm({ type: 'quadra', id: quadra.id, nome: quadra.nome })}>Remover quadra</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {quadraForm && (
        <Modal onClose={() => setQuadraForm(null)} title={quadraForm.id ? 'Editar quadra' : 'Nova quadra'}>
          <form onSubmit={saveQuadra}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label">Codigo</label>
                <input className="form-control" value={quadraForm.codigo}
                  onChange={(e) => setQuadraForm((p) => ({ ...p, codigo: e.target.value.toUpperCase() }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Nome</label>
                <input className="form-control" value={quadraForm.nome}
                  onChange={(e) => setQuadraForm((p) => ({ ...p, nome: e.target.value }))} placeholder="Quadra A" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Descricao</label>
              <input className="form-control" value={quadraForm.descricao}
                onChange={(e) => setQuadraForm((p) => ({ ...p, descricao: e.target.value }))} />
            </div>
            <ModalActions onCancel={() => setQuadraForm(null)} label="Salvar quadra" />
          </form>
        </Modal>
      )}

      {ruaForm && (
        <Modal onClose={() => setRuaForm(null)} title={ruaForm.id ? 'Editar rua' : `Nova rua - ${ruaForm.quadraNome}`}>
          <form onSubmit={saveRua}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '10px' }}>
              <div className="form-group">
                <label className="form-label">Rua</label>
                <input className="form-control" value={ruaForm.nome}
                  onChange={(e) => setRuaForm((p) => ({ ...p, nome: e.target.value }))} placeholder="Rua 1" required />
              </div>
              <div className="form-group">
                <label className="form-label">Ordem</label>
                <input className="form-control" type="number" min="1" max="99" value={ruaForm.ordem}
                  onChange={(e) => setRuaForm((p) => ({ ...p, ordem: e.target.value }))} required />
              </div>
            </div>
            <ModalActions onCancel={() => setRuaForm(null)} label="Salvar rua" />
          </form>
        </Modal>
      )}

      <ConfirmDialog open={!!confirm} danger
        title="Remover cadastro?"
        message={`Remover "${confirm?.nome}"?`}
        onConfirm={handleDelete}
        onCancel={() => setConfirm(null)}
      />
    </Layout>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--s)',
        borderRadius: '20px 20px 0 0',
        width: '100%',
        maxWidth: '560px',
        padding: '20px',
        paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ width: '36px', height: '4px', background: 'var(--bd)', borderRadius: '2px', margin: '0 auto 14px' }} />
        <h3 style={{ fontFamily: 'Syne,sans-serif', marginBottom: '14px' }}>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, label }) {
  return (
    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{label}</button>
    </div>
  );
}
