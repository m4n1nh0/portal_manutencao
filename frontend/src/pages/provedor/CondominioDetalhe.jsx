// Ficha completa de um condominio cliente: cadastro, uso, acessos e faturas.
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useToast } from '../../hooks/useToast';
import { Spinner, Input, Select, PasswordInput, ConfirmDialog, InfoBox } from '../../components/UI';
import { getRoleInfo } from '../../utils/auth';
import ProvedorLayout, { Indicador, StatusTag, moeda } from './ProvedorLayout';

const ABAS = [
  { id: 'cadastro', label: 'Cadastro' },
  { id: 'acessos',  label: 'Acessos' },
  { id: 'faturas',  label: 'Faturas' },
];

export default function CondominioDetalhe() {
  const { id } = useParams();
  const toast = useToast();
  const navigate = useNavigate();

  const [dados, setDados] = useState(null);
  const [planos, setPlanos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState('cadastro');
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [novoAdmin, setNovoAdmin] = useState(null);
  const [novaFatura, setNovaFatura] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [credenciais, setCredenciais] = useState(null);

  useEffect(() => { carregar(); }, [id]);

  async function carregar() {
    setLoading(true);
    try {
      const [detalhe, { planos }] = await Promise.all([api.provedor.condominio(id), api.provedor.planos()]);
      setDados(detalhe);
      setPlanos(planos);
      setForm(montarForm(detalhe.condominio));
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  function montarForm(c) {
    return {
      nome: c.nome || '', slug: c.slug || '', razao_social: c.razao_social || '', cnpj: c.cnpj || '',
      email_contato: c.email_contato || '', telefone: c.telefone || '', responsavel: c.responsavel || '',
      cep: c.cep || '', logradouro: c.logradouro || '', numero: c.numero || '', complemento: c.complemento || '',
      bairro: c.bairro || '', cidade: c.cidade || '', uf: c.uf || '',
      total_unidades: c.total_unidades ?? '', logo_url: c.logo_url || '', cor_primaria: c.cor_primaria || '',
      plano_id: c.plano_id || '', valor_mensal: c.valor_mensal ?? '',
      trial_expira_em: (c.trial_expira_em || '').slice(0, 10),
      contrato_inicio: (c.contrato_inicio || '').slice(0, 10),
      contrato_fim: (c.contrato_fim || '').slice(0, 10),
      dia_vencimento: c.dia_vencimento ?? 10, dias_tolerancia: c.dias_tolerancia ?? 5,
      bloqueio_automatico: Boolean(c.bloqueio_automatico), observacoes: c.observacoes || '',
    };
  }

  const set = (campo, valor) => setForm((p) => ({ ...p, [campo]: valor }));

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      await api.provedor.editarCondominio(id, form);
      toast('Cadastro atualizado.', 'success');
      carregar();
    } catch (e) { toast(e.message, 'error'); }
    finally { setSalvando(false); }
  }

  async function mudarStatus(status) {
    try {
      const { mensagem } = await api.provedor.statusCondominio(id, status);
      toast(mensagem, 'info');
      carregar();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function entrarComoSuporte() {
    try {
      const res = await api.provedor.impersonar(id);
      // O token de suporte vale só no subdomínio do cliente e expira sozinho.
      const destino = `${res.url}/login#suporte=${encodeURIComponent(res.token)}`;
      toast(`Abrindo o portal de ${res.condominio.nome} (acesso expira em ${res.expira_em_minutos} min).`, 'info');
      window.open(destino, '_blank', 'noopener');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function provisionar(modelo) {
    try {
      const { resumo } = await api.provedor.provisionar(id, { modelo, gerar_tarefas: false });
      toast(`Conteúdo criado: ${resumo.ciclo} dia(s) de ciclo, ${resumo.quadras} quadra(s), ${resumo.modelos} modelo(s).`, 'success');
      carregar();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function criarAdmin(e) {
    e.preventDefault();
    try {
      const res = await api.provedor.criarAdmin(id, novoAdmin);
      setCredenciais({ login: res.usuario.login, senha: novoAdmin.senha, url: res.url });
      setNovoAdmin(null);
      toast('Acesso criado.', 'success');
      carregar();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function criarFatura(e) {
    e.preventDefault();
    try {
      await api.provedor.criarFatura(id, novaFatura);
      setNovaFatura(null);
      toast('Fatura lançada.', 'success');
      carregar();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function pagar(faturaId) {
    try {
      const { mensagem } = await api.provedor.pagarFatura(faturaId);
      toast(mensagem, 'success');
      carregar();
    } catch (e) { toast(e.message, 'error'); }
  }

  if (loading || !dados) {
    return <ProvedorLayout title="Condomínio"><Spinner/></ProvedorLayout>;
  }

  const c = dados.condominio;
  const uso = dados.uso;

  return (
    <ProvedorLayout title={c.nome} subtitle={c.slug}
      actions={
        <>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/provedor/condominios')}>← Voltar</button>
          <button className="btn btn-primary btn-sm" onClick={entrarComoSuporte}>Entrar como suporte</button>
        </>
      }>

      <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap',marginBottom:'14px'}}>
        <StatusTag status={c.status}/>
        <a href={c.url} target="_blank" rel="noreferrer" className="stag" style={{color:'var(--blu)'}}>{c.url}</a>
        {c.plano_nome && <span className="muted-sm">{c.plano_nome}</span>}
        <span className="muted-sm">{moeda(c.valor_mensal ?? c.plano_preco)}/mês</span>
        {c.contrato?.mensagem && <span className="muted-sm" style={{color:'var(--red)'}}>{c.contrato.mensagem}</span>}
      </div>

      <div style={{display:'flex',gap:'12px',flexWrap:'wrap',marginBottom:'16px'}}>
        <Indicador rotulo="Usuários internos" valor={uso.internos}
          detalhe={c.max_usuarios ? `limite ${c.max_usuarios}` : 'ilimitado'}/>
        <Indicador rotulo="Moradores" valor={uso.moradores}
          detalhe={c.max_moradores ? `limite ${c.max_moradores}` : 'ilimitado'}/>
        <Indicador rotulo="Tarefas" valor={uso.tarefas} detalhe={`${uso.concluidas} concluída(s)`}/>
        <Indicador rotulo="Aprovações pendentes" valor={uso.pendentes} cor={uso.pendentes ? '#b45309' : 'var(--tx)'}/>
        <Indicador rotulo="Última atividade"
          valor={uso.ultima_atividade ? new Date(uso.ultima_atividade).toLocaleDateString('pt-BR') : '—'}/>
      </div>

      <div className="filter-row" style={{marginBottom:'16px'}}>
        {c.status !== 'ativo' && <button className="btn btn-success btn-sm" onClick={() => mudarStatus('ativo')}>Ativar contrato</button>}
        {c.status !== 'suspenso' && <button className="btn btn-warning btn-sm" onClick={() => setConfirmar({
          titulo:'Suspender acesso?',
          mensagem:`Ninguém do ${c.nome} conseguirá entrar no portal e as sessões ativas serão encerradas.`,
          acao:() => mudarStatus('suspenso'),
        })}>Suspender acesso</button>}
        {!c.provisionado_em && <button className="btn btn-ghost btn-sm" onClick={() => provisionar('padrao')}>Provisionar catálogo</button>}
        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmar({
          titulo:'Arquivar condomínio?',
          mensagem:'O acesso é encerrado, mas todos os dados são preservados e podem ser reativados depois.',
          acao: async () => {
            try { const { mensagem } = await api.provedor.arquivarCondominio(id); toast(mensagem, 'info'); navigate('/provedor/condominios'); }
            catch (e) { toast(e.message, 'error'); }
          },
        })}>Arquivar</button>
      </div>

      {credenciais && (
        <InfoBox color="#15803d" bg="rgba(21,128,61,.08)" border="rgba(21,128,61,.28)">
          Acesso criado — login <strong>{credenciais.login}</strong>, senha <strong>{credenciais.senha}</strong>.
          {' '}Entregue ao cliente e peça a troca no primeiro acesso: <a href={credenciais.url}>{credenciais.url}</a>
        </InfoBox>
      )}

      <div className="filter-row" style={{marginBottom:'14px'}}>
        {ABAS.map((a) => (
          <button key={a.id} className={`btn btn-sm ${aba === a.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setAba(a.id)}>{a.label}</button>
        ))}
      </div>

      {aba === 'cadastro' && form && (
        <form onSubmit={salvar}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
            <Input label="Nome" required value={form.nome} onChange={(e) => set('nome', e.target.value)}/>
            <Input label="Endereço de acesso" value={form.slug} onChange={(e) => set('slug', e.target.value)}/>
            <Input label="Razão social" value={form.razao_social} onChange={(e) => set('razao_social', e.target.value)}/>
            <Input label="CNPJ" value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)}/>
            <Input label="E-mail de contato" type="email" value={form.email_contato} onChange={(e) => set('email_contato', e.target.value)}/>
            <Input label="Telefone" value={form.telefone} onChange={(e) => set('telefone', e.target.value)}/>
            <Input label="Responsável" value={form.responsavel} onChange={(e) => set('responsavel', e.target.value)}/>
            <Input label="Unidades" type="number" min="0" value={form.total_unidades} onChange={(e) => set('total_unidades', e.target.value)}/>
            <Input label="CEP" value={form.cep} onChange={(e) => set('cep', e.target.value)}/>
            <Input label="Logradouro" value={form.logradouro} onChange={(e) => set('logradouro', e.target.value)}/>
            <Input label="Número" value={form.numero} onChange={(e) => set('numero', e.target.value)}/>
            <Input label="Bairro" value={form.bairro} onChange={(e) => set('bairro', e.target.value)}/>
            <Input label="Cidade" value={form.cidade} onChange={(e) => set('cidade', e.target.value)}/>
            <Input label="UF" maxLength={2} value={form.uf} onChange={(e) => set('uf', e.target.value.toUpperCase())}/>
            <Input label="URL do logotipo" value={form.logo_url} onChange={(e) => set('logo_url', e.target.value)}
              placeholder="aparece na tela de login do cliente"/>
            <Input label="Cor primária" value={form.cor_primaria} onChange={(e) => set('cor_primaria', e.target.value)} placeholder="#0f766e"/>
          </div>

          <h4 style={{fontFamily:'Syne,sans-serif',margin:'14px 0 8px'}}>Contrato e cobrança</h4>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
            <Select label="Plano" value={form.plano_id} onChange={(e) => set('plano_id', e.target.value)}>
              <option value="">Sem plano</option>
              {planos.map((p) => <option key={p.id} value={p.id}>{p.nome} — {moeda(p.preco_mensal)}/mês</option>)}
            </Select>
            <Input label="Valor mensal (sobrepõe o plano)" type="number" step="0.01" min="0"
              value={form.valor_mensal} onChange={(e) => set('valor_mensal', e.target.value)}/>
            <Input label="Início do contrato" type="date" value={form.contrato_inicio} onChange={(e) => set('contrato_inicio', e.target.value)}/>
            <Input label="Fim do contrato" type="date" value={form.contrato_fim} onChange={(e) => set('contrato_fim', e.target.value)}/>
            <Input label="Fim da avaliação" type="date" value={form.trial_expira_em} onChange={(e) => set('trial_expira_em', e.target.value)}/>
            <Input label="Dia de vencimento" type="number" min="1" max="28" value={form.dia_vencimento} onChange={(e) => set('dia_vencimento', e.target.value)}/>
            <Input label="Dias de tolerância" type="number" min="0" value={form.dias_tolerancia} onChange={(e) => set('dias_tolerancia', e.target.value)}/>
            <div className="form-group" style={{display:'flex',alignItems:'flex-end'}}>
              <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',paddingBottom:'10px'}}>
                <input type="checkbox" checked={form.bloqueio_automatico}
                  onChange={(e) => set('bloqueio_automatico', e.target.checked)}/>
                Bloquear automaticamente por inadimplência
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Observações internas</label>
            <textarea className="form-control" rows={3} value={form.observacoes}
              onChange={(e) => set('observacoes', e.target.value)}/>
          </div>

          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar cadastro'}
          </button>
        </form>
      )}

      {aba === 'acessos' && (
        <>
          <div className="filter-row" style={{marginBottom:'12px'}}>
            <button className="btn btn-primary btn-sm" onClick={() => setNovoAdmin({
              nome:'', email:'', login:'', senha:'', perfil:'sindico',
            })}>+ Novo acesso administrativo</button>
          </div>
          <div className="task-list">
            {dados.administradores.length === 0 && <p className="muted-sm">Nenhum usuário administrativo cadastrado.</p>}
            {dados.administradores.map((u) => {
              const role = getRoleInfo(u.perfil);
              return (
                <div key={u.id} className="task-card">
                  <div className="task-card-top">
                    <div className="task-card-title">{u.nome}</div>
                    <span style={{background:role.color+'22',color:role.color,padding:'3px 10px',
                      borderRadius:'20px',fontSize:'11px',fontWeight:600}}>{role.label}</span>
                  </div>
                  <div className="task-card-meta">
                    <span className="stag" style={{color:'var(--blu)'}}>{u.login}</span>
                    <span className="muted-sm">{u.email}</span>
                    <span className="muted-sm">
                      {u.ultimo_login ? `último acesso ${new Date(u.ultimo_login).toLocaleDateString('pt-BR')}` : 'nunca acessou'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {aba === 'faturas' && (
        <>
          <div className="filter-row" style={{marginBottom:'12px'}}>
            <button className="btn btn-primary btn-sm" onClick={() => setNovaFatura({
              competencia: new Date().toISOString().slice(0, 7),
              valor: c.valor_mensal ?? c.plano_preco ?? '',
              descricao: '',
            })}>+ Lançar fatura</button>
          </div>
          <div className="task-list">
            {dados.faturas.length === 0 && <p className="muted-sm">Nenhuma fatura lançada.</p>}
            {dados.faturas.map((f) => (
              <div key={f.id} className="task-card">
                <div className="task-card-top">
                  <div className="task-card-title">{f.competencia} — {moeda(f.valor)}</div>
                  <span style={{
                    fontSize:'11px',fontWeight:700,padding:'3px 10px',borderRadius:'20px',
                    color: f.status === 'paga' ? '#15803d' : f.status === 'vencida' ? '#b91c1c' : '#b45309',
                    background: f.status === 'paga' ? '#15803d1a' : f.status === 'vencida' ? '#b91c1c1a' : '#b453091a',
                  }}>{f.status}</span>
                </div>
                <div className="task-card-meta">
                  <span className="muted-sm">vence {new Date(f.vencimento).toLocaleDateString('pt-BR')}</span>
                  {f.pago_em && <span className="muted-sm">pago em {new Date(f.pago_em).toLocaleDateString('pt-BR')}</span>}
                  {f.descricao && <span className="muted-sm">{f.descricao}</span>}
                </div>
                {['aberta','vencida'].includes(f.status) && (
                  <div className="task-actions">
                    <button className="btn btn-success btn-sm" onClick={() => pagar(f.id)}>Registrar pagamento</button>
                    <button className="btn btn-ghost btn-sm" onClick={async () => {
                      try { await api.provedor.cancelarFatura(f.id); toast('Fatura cancelada.', 'info'); carregar(); }
                      catch (e) { toast(e.message, 'error'); }
                    }}>Cancelar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {novoAdmin && (
        <ModalSimples titulo="Novo acesso administrativo" onFechar={() => setNovoAdmin(null)}>
          <form onSubmit={criarAdmin}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
              <Input label="Nome" required value={novoAdmin.nome}
                onChange={(e) => setNovoAdmin({ ...novoAdmin, nome: e.target.value })}/>
              <Input label="E-mail" type="email" required value={novoAdmin.email}
                onChange={(e) => setNovoAdmin({ ...novoAdmin, email: e.target.value })}/>
              <Input label="Login" required value={novoAdmin.login}
                onChange={(e) => setNovoAdmin({ ...novoAdmin, login: e.target.value })}/>
              <Select label="Perfil" value={novoAdmin.perfil}
                onChange={(e) => setNovoAdmin({ ...novoAdmin, perfil: e.target.value })}>
                <option value="sindico">Síndico</option>
                <option value="admin">Administrador</option>
                <option value="supervisor">Supervisor</option>
                <option value="subsindico">Subsíndico</option>
                <option value="conselho">Conselho</option>
                <option value="campo">Equipe de campo</option>
              </Select>
            </div>
            <PasswordInput label="Senha provisória" required value={novoAdmin.senha}
              onChange={(e) => setNovoAdmin({ ...novoAdmin, senha: e.target.value })}
              placeholder="mín. 8, com maiúscula, número e símbolo"/>
            <div style={{display:'flex',gap:'10px',marginTop:'12px'}}>
              <button type="button" className="btn btn-ghost" onClick={() => setNovoAdmin(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" style={{flex:1}}>Criar acesso</button>
            </div>
          </form>
        </ModalSimples>
      )}

      {novaFatura && (
        <ModalSimples titulo="Lançar fatura" onFechar={() => setNovaFatura(null)}>
          <form onSubmit={criarFatura}>
            <Input label="Competência (AAAA-MM)" required value={novaFatura.competencia}
              onChange={(e) => setNovaFatura({ ...novaFatura, competencia: e.target.value })} placeholder="2026-08"/>
            <Input label="Valor" type="number" step="0.01" min="0" required value={novaFatura.valor}
              onChange={(e) => setNovaFatura({ ...novaFatura, valor: e.target.value })}/>
            <Input label="Descrição" value={novaFatura.descricao}
              onChange={(e) => setNovaFatura({ ...novaFatura, descricao: e.target.value })}/>
            <div style={{display:'flex',gap:'10px',marginTop:'12px'}}>
              <button type="button" className="btn btn-ghost" onClick={() => setNovaFatura(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" style={{flex:1}}>Lançar</button>
            </div>
          </form>
        </ModalSimples>
      )}

      <ConfirmDialog open={!!confirmar} danger
        title={confirmar?.titulo} message={confirmar?.mensagem}
        onConfirm={() => { confirmar.acao(); setConfirmar(null); }}
        onCancel={() => setConfirmar(null)}/>
    </ProvedorLayout>
  );
}

function ModalSimples({ titulo, children, onFechar }) {
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:200,
      display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background:'var(--s)',borderRadius:'16px',width:'100%',maxWidth:'560px',
        padding:'22px',maxHeight:'90vh',overflowY:'auto',
      }}>
        <h3 style={{fontFamily:'Syne,sans-serif',marginBottom:'14px'}}>{titulo}</h3>
        {children}
      </div>
    </div>
  );
}
