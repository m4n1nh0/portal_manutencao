// Cadastro e gestao dos condominios clientes.
// O formulario de criacao faz o onboarding inteiro numa tacada: cadastro
// comercial + conteudo inicial + primeiro usuario administrativo.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { useToast } from '../../hooks/useToast';
import { Spinner, EmptyState, Input, Select, PasswordInput, InfoBox } from '../../components/UI';
import ProvedorLayout, { StatusTag, moeda } from './ProvedorLayout';

const FORM_VAZIO = {
  nome: '', slug: '', razao_social: '', cnpj: '', email_contato: '', telefone: '', responsavel: '',
  cidade: '', uf: '', total_unidades: '',
  plano_codigo: '', valor_mensal: '', status: 'trial', dia_vencimento: 10,
  provisionar: 'padrao', gerar_tarefas: false,
  criar_admin: true,
  admin_nome: '', admin_email: '', admin_login: '', admin_senha: '', admin_perfil: 'sindico',
};

function slugify(texto) {
  return texto.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export default function Condominios() {
  const toast = useToast();
  const navigate = useNavigate();

  const [condominios, setCondominios] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [slugCheck, setSlugCheck] = useState(null);
  const [resultado, setResultado] = useState(null);

  useEffect(() => { carregar(); }, [filtroStatus]);

  async function carregar() {
    setLoading(true);
    try {
      const [{ condominios }, { planos }] = await Promise.all([
        api.provedor.condominios(filtroStatus ? { status: filtroStatus } : {}),
        api.provedor.planos(),
      ]);
      setCondominios(condominios);
      setPlanos(planos);
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  const listados = useMemo(() => {
    if (!busca) return condominios;
    const termo = busca.toLowerCase();
    return condominios.filter((c) =>
      `${c.nome} ${c.slug} ${c.cidade || ''} ${c.cnpj || ''}`.toLowerCase().includes(termo));
  }, [condominios, busca]);

  function abrirNovo() {
    setResultado(null);
    setSlugCheck(null);
    setForm({ ...FORM_VAZIO, plano_codigo: planos[0]?.codigo || '' });
  }

  function set(campo, valor) {
    setForm((p) => ({ ...p, [campo]: valor }));
  }

  // Sugere o endereço a partir do nome enquanto o usuário digita.
  function onNome(valor) {
    setForm((p) => {
      const slugAtual = p.slug;
      const sugestaoAnterior = slugify(p.nome);
      const manterManual = slugAtual && slugAtual !== sugestaoAnterior;
      return { ...p, nome: valor, slug: manterManual ? slugAtual : slugify(valor) };
    });
  }

  async function checarSlug() {
    if (!form?.slug) return;
    try { setSlugCheck(await api.provedor.slugDisponivel(form.slug)); }
    catch (e) { setSlugCheck({ disponivel: false, motivo: e.message }); }
  }

  async function salvar(e) {
    e.preventDefault();
    setSalvando(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        slug: form.slug.trim(),
        razao_social: form.razao_social || null,
        cnpj: form.cnpj || null,
        email_contato: form.email_contato || null,
        telefone: form.telefone || null,
        responsavel: form.responsavel || null,
        cidade: form.cidade || null,
        uf: form.uf || null,
        total_unidades: form.total_unidades || null,
        plano_codigo: form.plano_codigo || null,
        valor_mensal: form.valor_mensal === '' ? null : form.valor_mensal,
        status: form.status,
        dia_vencimento: form.dia_vencimento,
        provisionar: form.provisionar,
        gerar_tarefas: form.gerar_tarefas,
      };
      if (form.criar_admin && form.admin_email) {
        payload.administrador = {
          nome: form.admin_nome,
          email: form.admin_email,
          login: form.admin_login || slugify(form.admin_nome).replace(/-/g, '_'),
          senha: form.admin_senha,
          perfil: form.admin_perfil,
        };
      }

      const res = await api.provedor.criarCondominio(payload);
      setResultado({ ...res, senha: form.admin_senha, login: payload.administrador?.login });
      setForm(null);
      toast('Condomínio cadastrado!', 'success');
      carregar();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ProvedorLayout title="Condomínios" subtitle={`${condominios.length} na carteira`}
      actions={<button className="btn btn-primary btn-sm" onClick={abrirNovo}>+ Novo condomínio</button>}>

      <div className="filter-row" style={{marginBottom:'16px'}}>
        <input className="filter-select" type="text" placeholder="🔍 Buscar por nome, endereço, cidade ou CNPJ…"
          value={busca} onChange={(e) => setBusca(e.target.value)} style={{minWidth:'240px'}}/>
        <select className="filter-select" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
          <option value="">Todos os status</option>
          <option value="trial">Em avaliação</option>
          <option value="ativo">Ativos</option>
          <option value="inadimplente">Inadimplentes</option>
          <option value="suspenso">Suspensos</option>
          <option value="cancelado">Cancelados</option>
        </select>
      </div>

      {resultado && (
        <InfoBox color="#15803d" bg="rgba(21,128,61,.08)" border="rgba(21,128,61,.28)">
          <strong>{resultado.condominio.nome}</strong> criado.
          <div style={{marginTop:'6px'}}>
            Endereço de acesso: <a href={resultado.condominio.url} target="_blank" rel="noreferrer"
              style={{fontWeight:600}}>{resultado.condominio.url}</a>
          </div>
          {resultado.provisionamento && (
            <div style={{marginTop:'4px',fontSize:'13px'}}>
              Conteúdo inicial: {resultado.provisionamento.ciclo} dia(s) de ciclo, {resultado.provisionamento.quadras} quadra(s),
              {' '}{resultado.provisionamento.modelos} modelo(s) de tarefa
              {resultado.provisionamento.tarefas > 0 && `, ${resultado.provisionamento.tarefas} tarefa(s)`}.
            </div>
          )}
          {resultado.administrador && (
            <div style={{marginTop:'4px',fontSize:'13px'}}>
              Primeiro acesso: <strong>{resultado.administrador.login}</strong> / <strong>{resultado.senha}</strong>
              {' '}— anote agora, a senha não é exibida de novo.
            </div>
          )}
          {resultado.administrador_erro && (
            <div style={{marginTop:'4px',fontSize:'13px',color:'var(--red)'}}>
              Usuário administrativo não criado: {resultado.administrador_erro}
            </div>
          )}
        </InfoBox>
      )}

      {loading ? <Spinner/> : listados.length === 0 ? (
        <EmptyState icon="🏢" title="Nenhum condomínio"
          desc="Cadastre o primeiro cliente para começar a vender o portal."/>
      ) : (
        <div className="task-list">
          {listados.map((c) => (
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
              <div className="task-card-meta" style={{marginTop:'4px'}}>
                <span className="muted-sm">👥 {c.uso.internos} interno(s) · {c.uso.moradores} morador(es)</span>
                <span className="muted-sm">📋 {c.uso.tarefas} tarefa(s)</span>
                {c.uso.pendentes > 0 && <span className="muted-sm">⏳ {c.uso.pendentes} aprovação(ões)</span>}
                {!c.provisionado_em && <span className="muted-sm" style={{color:'var(--red)'}}>não provisionado</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {form && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:200,
          display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',overflowY:'auto'}}
          onClick={() => setForm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background:'var(--s)',borderRadius:'16px',width:'100%',maxWidth:'720px',
            padding:'22px',maxHeight:'92vh',overflowY:'auto',
          }}>
            <h3 style={{fontFamily:'Syne,sans-serif',marginBottom:'4px'}}>Novo condomínio</h3>
            <p className="muted-sm" style={{marginBottom:'16px'}}>
              O cliente acessa por um endereço próprio e recebe uma cópia isolada do conteúdo base.
            </p>

            <form onSubmit={salvar}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <Input label="Nome do condomínio" required value={form.nome}
                  onChange={(e) => onNome(e.target.value)} placeholder="Residencial Jardins"/>
                <div className="form-group">
                  <label className="form-label">Endereço de acesso *</label>
                  <input className="form-control" value={form.slug} required
                    onChange={(e) => { set('slug', slugify(e.target.value)); setSlugCheck(null); }}
                    onBlur={checarSlug} placeholder="jardins"/>
                  <div className="muted-sm" style={{marginTop:'4px'}}>
                    {slugCheck
                      ? <span style={{color: slugCheck.disponivel ? 'var(--grn)' : 'var(--red)'}}>
                          {slugCheck.disponivel ? `✓ ${slugCheck.url}` : `✗ ${slugCheck.motivo}`}
                        </span>
                      : form.slug ? `${form.slug}.seudominio.com.br` : 'Vira o subdomínio do cliente'}
                  </div>
                </div>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <Input label="Razão social" value={form.razao_social} onChange={(e) => set('razao_social', e.target.value)}/>
                <Input label="CNPJ" value={form.cnpj} onChange={(e) => set('cnpj', e.target.value)}/>
                <Input label="E-mail de contato" type="email" value={form.email_contato}
                  onChange={(e) => set('email_contato', e.target.value)}/>
                <Input label="Telefone" value={form.telefone} onChange={(e) => set('telefone', e.target.value)}/>
                <Input label="Responsável" value={form.responsavel} onChange={(e) => set('responsavel', e.target.value)}
                  placeholder="Nome do síndico"/>
                <Input label="Unidades" type="number" min="0" value={form.total_unidades}
                  onChange={(e) => set('total_unidades', e.target.value)}/>
                <Input label="Cidade" value={form.cidade} onChange={(e) => set('cidade', e.target.value)}/>
                <Input label="UF" maxLength={2} value={form.uf} onChange={(e) => set('uf', e.target.value.toUpperCase())}/>
              </div>

              <h4 style={{fontFamily:'Syne,sans-serif',margin:'14px 0 8px'}}>Contrato</h4>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <Select label="Plano" value={form.plano_codigo} onChange={(e) => set('plano_codigo', e.target.value)}>
                  <option value="">Sem plano</option>
                  {planos.map((p) => (
                    <option key={p.id} value={p.codigo}>{p.nome} — {moeda(p.preco_mensal)}/mês</option>
                  ))}
                </Select>
                <Select label="Situação inicial" value={form.status} onChange={(e) => set('status', e.target.value)}>
                  <option value="trial">Período de avaliação</option>
                  <option value="ativo">Contrato ativo</option>
                </Select>
                <Input label="Valor mensal (sobrepõe o plano)" type="number" step="0.01" min="0"
                  value={form.valor_mensal} onChange={(e) => set('valor_mensal', e.target.value)} placeholder="opcional"/>
                <Input label="Dia de vencimento" type="number" min="1" max="28"
                  value={form.dia_vencimento} onChange={(e) => set('dia_vencimento', e.target.value)}/>
              </div>

              <h4 style={{fontFamily:'Syne,sans-serif',margin:'14px 0 8px'}}>Conteúdo inicial</h4>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <Select label="Provisionamento" value={form.provisionar} onChange={(e) => set('provisionar', e.target.value)}>
                  <option value="padrao">Catálogo padrão (ciclo, quadras, equipes, modelos)</option>
                  <option value="vazio">Começar vazio</option>
                  {condominios.map((c) => (
                    <option key={c.id} value={c.id}>Copiar de: {c.nome}</option>
                  ))}
                </Select>
                <div className="form-group" style={{display:'flex',alignItems:'flex-end'}}>
                  <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',paddingBottom:'10px'}}>
                    <input type="checkbox" checked={form.gerar_tarefas}
                      onChange={(e) => set('gerar_tarefas', e.target.checked)}/>
                    Já gerar as tarefas de hoje
                  </label>
                </div>
              </div>

              <h4 style={{fontFamily:'Syne,sans-serif',margin:'14px 0 8px'}}>
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'15px'}}>
                  <input type="checkbox" checked={form.criar_admin}
                    onChange={(e) => set('criar_admin', e.target.checked)}/>
                  Criar o primeiro acesso do cliente
                </label>
              </h4>
              {form.criar_admin && (
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                  <Input label="Nome" required={form.criar_admin} value={form.admin_nome}
                    onChange={(e) => set('admin_nome', e.target.value)}/>
                  <Input label="E-mail" type="email" required={form.criar_admin} value={form.admin_email}
                    onChange={(e) => set('admin_email', e.target.value)}/>
                  <Input label="Login" value={form.admin_login} onChange={(e) => set('admin_login', e.target.value)}
                    placeholder="gerado a partir do nome"/>
                  <Select label="Perfil" value={form.admin_perfil} onChange={(e) => set('admin_perfil', e.target.value)}>
                    <option value="sindico">Síndico</option>
                    <option value="admin">Administrador</option>
                    <option value="supervisor">Supervisor</option>
                  </Select>
                  <div style={{gridColumn:'1 / -1'}}>
                    <PasswordInput label="Senha provisória" required={form.criar_admin} value={form.admin_senha}
                      onChange={(e) => set('admin_senha', e.target.value)}
                      placeholder="mín. 8, com maiúscula, número e símbolo"/>
                  </div>
                </div>
              )}

              <div style={{display:'flex',gap:'10px',marginTop:'18px'}}>
                <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{flex:1}} disabled={salvando}>
                  {salvando ? 'Criando…' : 'Criar condomínio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </ProvedorLayout>
  );
}
