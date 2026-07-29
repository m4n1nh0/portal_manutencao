// Visao geral comercial: carteira de condominios e saude financeira.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useToast } from '../../hooks/useToast';
import { Spinner } from '../../components/UI';
import ProvedorLayout, { Indicador, StatusTag, moeda } from './ProvedorLayout';

export default function ProvedorDashboard() {
  const toast = useToast();
  const navigate = useNavigate();
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rodando, setRodando] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try { setDados(await api.provedor.dashboard()); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  async function rodarRotina() {
    setRodando(true);
    try {
      const r = await api.provedor.atualizarInadimplencia();
      toast(`Rotina aplicada: ${r.vencidas} fatura(s) vencida(s), ${r.inadimplentes} inadimplente(s), ${r.suspensos} suspenso(s), ${r.reativados} reativado(s).`, 'info');
      carregar();
    } catch (e) { toast(e.message, 'error'); }
    finally { setRodando(false); }
  }

  const t = dados?.totais;
  const f = dados?.financeiro;

  return (
    <ProvedorLayout title="Visão geral" subtitle="Carteira de clientes"
      actions={
        <button className="btn btn-ghost btn-sm" onClick={rodarRotina} disabled={rodando}>
          {rodando ? 'Processando…' : '↻ Rodar cobrança'}
        </button>
      }>
      {loading ? <Spinner/> : !dados ? null : (
        <>
          <div style={{display:'flex',gap:'12px',flexWrap:'wrap',marginBottom:'18px'}}>
            <Indicador rotulo="Receita mensal" valor={moeda(f.mrr)} detalhe="contratos ativos + inadimplentes"/>
            <Indicador rotulo="Recebido no mês" valor={moeda(f.recebido_no_mes)} cor="#15803d"/>
            <Indicador rotulo="Em atraso" valor={moeda(f.em_atraso.total)} detalhe={`${f.em_atraso.quantidade} fatura(s)`} cor="#b91c1c"/>
            <Indicador rotulo="A receber" valor={moeda(f.em_aberto.total)} detalhe={`${f.em_aberto.quantidade} fatura(s)`}/>
          </div>

          <div style={{display:'flex',gap:'12px',flexWrap:'wrap',marginBottom:'22px'}}>
            <Indicador rotulo="Condomínios" valor={t.condominios}/>
            <Indicador rotulo="Ativos" valor={t.ativos} cor="#15803d"/>
            <Indicador rotulo="Em avaliação" valor={t.em_trial} cor="#b45309"/>
            <Indicador rotulo="Inadimplentes" valor={t.inadimplentes} cor="#b45309"/>
            <Indicador rotulo="Suspensos" valor={t.suspensos} cor="#b91c1c"/>
            <Indicador rotulo="Moradores" valor={t.moradores} detalhe="somando toda a carteira"/>
          </div>

          <h3 style={{fontFamily:'Syne,sans-serif',marginBottom:'10px'}}>Últimos condomínios</h3>
          <div className="task-list" style={{marginBottom:'24px'}}>
            {dados.recentes.length === 0 && <p className="muted-sm">Nenhum condomínio cadastrado ainda.</p>}
            {dados.recentes.map((c) => (
              <div key={c.id} className="task-card" style={{cursor:'pointer'}}
                onClick={() => navigate(`/provedor/condominios/${c.id}`)}>
                <div className="task-card-top">
                  <div className="task-card-title">{c.nome}</div>
                  <StatusTag status={c.status}/>
                </div>
                <div className="task-card-meta">
                  <span className="stag" style={{color:'var(--blu)'}}>{c.slug}</span>
                  {c.plano_nome && <span className="muted-sm">{c.plano_nome}</span>}
                  <span className="muted-sm">{moeda(c.valor_mensal ?? c.plano_preco)}/mês</span>
                  {c.cidade && <span className="muted-sm">{c.cidade}{c.uf ? `/${c.uf}` : ''}</span>}
                </div>
              </div>
            ))}
          </div>

          <h3 style={{fontFamily:'Syne,sans-serif',marginBottom:'10px'}}>Faturas a vencer e vencidas</h3>
          <div className="task-list">
            {dados.faturas_pendentes.length === 0 && <p className="muted-sm">Nenhuma fatura em aberto. 🎉</p>}
            {dados.faturas_pendentes.map((fat) => (
              <div key={fat.id} className="task-card">
                <div className="task-card-top">
                  <div className="task-card-title">{fat.condominio_nome}</div>
                  <span style={{
                    fontSize:'11px', fontWeight:700, padding:'3px 10px', borderRadius:'20px',
                    color: fat.status === 'vencida' ? '#b91c1c' : '#b45309',
                    background: fat.status === 'vencida' ? '#b91c1c1a' : '#b453091a',
                  }}>{fat.status === 'vencida' ? 'Vencida' : 'Em aberto'}</span>
                </div>
                <div className="task-card-meta">
                  <span className="muted-sm">{fat.competencia}</span>
                  <span className="muted-sm">{moeda(fat.valor)}</span>
                  <span className="muted-sm">vence {new Date(fat.vencimento).toLocaleDateString('pt-BR')}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </ProvedorLayout>
  );
}
