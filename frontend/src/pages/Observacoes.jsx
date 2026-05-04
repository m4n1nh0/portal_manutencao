import { useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import { EmptyState, SectorTag, Spinner } from '../components/UI';
import { useToast } from '../hooks/useToast';
import api from '../utils/api';

export default function Observacoes() {
  const toast = useToast();
  const [observacoes, setObservacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  async function load() {
    setLoading(true);
    try {
      const { observacoes } = await api.listarObs();
      setObservacoes(observacoes);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return observacoes;
    return observacoes.filter((obs) =>
      `${obs.setor || ''} ${obs.mensagem || ''} ${obs.usuario_nome || ''}`.toLowerCase().includes(q)
    );
  }, [busca, observacoes]);

  return (
    <Layout title="Observacoes">
      <div className="filter-row" style={{ marginBottom: '16px' }}>
        <input
          className="filter-select"
          type="text"
          placeholder="Buscar por setor, morador ou mensagem..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          style={{ minWidth: '240px' }}
        />
        <button className="btn btn-ghost btn-sm" onClick={load}>Atualizar</button>
      </div>

      {loading ? <Spinner /> : rows.length === 0 ? (
        <EmptyState icon="!" title="Nenhuma observacao" desc="Quando um morador enviar uma observacao, ela aparecera aqui." />
      ) : (
        <div className="task-list">
          {rows.map((obs) => (
            <div key={obs.id} className="task-card">
              <div className="task-card-top">
                <div className="task-card-title">{obs.usuario_nome || 'Morador'}</div>
                {obs.setor && <SectorTag setor={obs.setor} />}
              </div>
              <div className="task-card-meta">
                <span className="muted-sm">
                  {obs.criado_em ? new Date(obs.criado_em).toLocaleString('pt-BR') : ''}
                </span>
                <span className="muted-sm">{obs.lida ? 'Lida' : 'Nova'}</span>
              </div>
              <div className="task-obs" style={{ marginTop: '10px' }}>{obs.mensagem}</div>
            </div>
          ))}
        </div>
      )}
    </Layout>
  );
}
