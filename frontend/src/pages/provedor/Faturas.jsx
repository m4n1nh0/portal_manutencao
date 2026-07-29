// Faturamento da carteira: geracao mensal, baixa de pagamento e cobranca.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useToast } from '../../hooks/useToast';
import { Spinner, EmptyState } from '../../components/UI';
import ProvedorLayout, { Indicador, moeda } from './ProvedorLayout';

const CORES = {
  aberta:    '#b45309',
  vencida:   '#b91c1c',
  paga:      '#15803d',
  cancelada: '#6b7280',
};

function competenciaAtual() {
  return new Date().toISOString().slice(0, 7);
}

export default function Faturas() {
  const toast = useToast();
  const navigate = useNavigate();
  const [faturas, setFaturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [gerando, setGerando] = useState(false);

  useEffect(() => { carregar(); }, [status, competencia]);

  async function carregar() {
    setLoading(true);
    try {
      const params = {};
      if (status) params.status = status;
      if (competencia) params.competencia = competencia;
      setFaturas((await api.provedor.faturas(params)).faturas);
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function gerarMes() {
    setGerando(true);
    try {
      const r = await api.provedor.gerarFaturas(competenciaAtual());
      toast(`${r.geradas} fatura(s) gerada(s) para ${r.competencia}.`, 'success');
      carregar();
    } catch (e) { toast(e.message, 'error'); }
    finally { setGerando(false); }
  }

  async function pagar(id) {
    try {
      const { mensagem } = await api.provedor.pagarFatura(id);
      toast(mensagem, 'success');
      carregar();
    } catch (e) { toast(e.message, 'error'); }
  }

  const totais = faturas.reduce((acc, f) => {
    const valor = Number(f.status === 'paga' ? (f.valor_pago ?? f.valor) : f.valor);
    acc[f.status] = (acc[f.status] || 0) + valor;
    return acc;
  }, {});

  return (
    <ProvedorLayout title="Faturas" subtitle="Cobrança da carteira"
      actions={
        <button className="btn btn-primary btn-sm" onClick={gerarMes} disabled={gerando}>
          {gerando ? 'Gerando…' : `Gerar faturas de ${competenciaAtual()}`}
        </button>
      }>

      <div style={{display:'flex',gap:'12px',flexWrap:'wrap',marginBottom:'16px'}}>
        <Indicador rotulo="Em aberto" valor={moeda(totais.aberta)} cor={CORES.aberta}/>
        <Indicador rotulo="Vencidas" valor={moeda(totais.vencida)} cor={CORES.vencida}/>
        <Indicador rotulo="Pagas" valor={moeda(totais.paga)} cor={CORES.paga}/>
      </div>

      <div className="filter-row" style={{marginBottom:'16px'}}>
        <select className="filter-select" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todas</option>
          <option value="aberta">Em aberto</option>
          <option value="vencida">Vencidas</option>
          <option value="paga">Pagas</option>
          <option value="cancelada">Canceladas</option>
        </select>
        <input className="filter-select" type="month" value={competencia}
          onChange={(e) => setCompetencia(e.target.value)} style={{minWidth:'160px'}}/>
        {(status || competencia) && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setStatus(''); setCompetencia(''); }}>Limpar</button>
        )}
      </div>

      {loading ? <Spinner/> : faturas.length === 0 ? (
        <EmptyState icon="🧾" title="Nenhuma fatura" desc="Gere as faturas do mês para começar a cobrança."/>
      ) : (
        <div className="task-list">
          {faturas.map((f) => (
            <div key={f.id} className="task-card">
              <div className="task-card-top">
                <div className="task-card-title" style={{cursor:'pointer'}}
                  onClick={() => navigate(`/provedor/condominios/${f.condominio_id}`)}>
                  {f.condominio_nome}
                </div>
                <span style={{
                  fontSize:'11px',fontWeight:700,padding:'3px 10px',borderRadius:'20px',
                  color:CORES[f.status], background:`${CORES[f.status]}1a`,
                }}>{f.status}</span>
              </div>
              <div className="task-card-meta">
                <span className="stag" style={{color:'var(--blu)'}}>{f.competencia}</span>
                <span style={{fontWeight:600}}>{moeda(f.valor)}</span>
                <span className="muted-sm">vence {new Date(f.vencimento).toLocaleDateString('pt-BR')}</span>
                {f.pago_em && <span className="muted-sm">pago em {new Date(f.pago_em).toLocaleDateString('pt-BR')}</span>}
              </div>
              {['aberta','vencida'].includes(f.status) && (
                <div className="task-actions">
                  <button className="btn btn-success btn-sm" onClick={() => pagar(f.id)}>Registrar pagamento</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </ProvedorLayout>
  );
}
