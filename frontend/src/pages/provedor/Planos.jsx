// Planos comerciais: preco e limites que o sistema passa a cobrar de fato.
import { useEffect, useState } from 'react';
import api from '../../utils/api';
import { useToast } from '../../hooks/useToast';
import { Spinner, Input, ConfirmDialog } from '../../components/UI';
import ProvedorLayout, { moeda } from './ProvedorLayout';

const RECURSOS = [
  { chave: 'agendamento',   label: 'Agendamento automático' },
  { chave: 'kanban',        label: 'Quadro kanban' },
  { chave: 'auditoria',     label: 'Auditoria completa' },
  { chave: '2fa',           label: 'Duplo fator' },
  { chave: 'marca_propria', label: 'Marca própria (logo/cor)' },
];

const NOVO = {
  codigo:'', nome:'', descricao:'', preco_mensal:'',
  max_unidades:'', max_usuarios:'', max_moradores:'', ordem:0, ativo:true,
  recursos: { agendamento:true, kanban:true, auditoria:false, '2fa':false, marca_propria:false },
};

export default function Planos() {
  const toast = useToast();
  const [planos, setPlanos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [confirmar, setConfirmar] = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try { setPlanos((await api.provedor.planos()).planos); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }

  function editar(plano) {
    const recursos = typeof plano.recursos === 'string' ? JSON.parse(plano.recursos) : (plano.recursos || {});
    setForm({
      id: plano.id, codigo: plano.codigo, nome: plano.nome, descricao: plano.descricao || '',
      preco_mensal: plano.preco_mensal, max_unidades: plano.max_unidades ?? '',
      max_usuarios: plano.max_usuarios ?? '', max_moradores: plano.max_moradores ?? '',
      ordem: plano.ordem, ativo: Boolean(plano.ativo), recursos,
    });
  }

  const set = (campo, valor) => setForm((p) => ({ ...p, [campo]: valor }));

  async function salvar(e) {
    e.preventDefault();
    try {
      if (form.id) await api.provedor.editarPlano(form.id, form);
      else await api.provedor.criarPlano(form);
      toast(form.id ? 'Plano atualizado.' : 'Plano criado.', 'success');
      setForm(null);
      carregar();
    } catch (e) { toast(e.message, 'error'); }
  }

  return (
    <ProvedorLayout title="Planos" subtitle="Preços e limites"
      actions={<button className="btn btn-primary btn-sm" onClick={() => setForm({ ...NOVO })}>+ Novo plano</button>}>

      {loading ? <Spinner/> : (
        <div className="task-list">
          {planos.map((p) => {
            const recursos = typeof p.recursos === 'string' ? JSON.parse(p.recursos) : (p.recursos || {});
            return (
              <div key={p.id} className="task-card">
                <div className="task-card-top">
                  <div className="task-card-title">{p.nome}</div>
                  <span style={{fontFamily:'Syne,sans-serif',fontWeight:700}}>{moeda(p.preco_mensal)}/mês</span>
                </div>
                {p.descricao && <div className="muted-sm" style={{marginBottom:'6px'}}>{p.descricao}</div>}
                <div className="task-card-meta">
                  <span className="stag" style={{color:'var(--blu)'}}>{p.codigo}</span>
                  <span className="muted-sm">{p.max_unidades ? `${p.max_unidades} unidades` : 'unidades ilimitadas'}</span>
                  <span className="muted-sm">{p.max_usuarios ? `${p.max_usuarios} internos` : 'internos ilimitados'}</span>
                  <span className="muted-sm">{p.max_moradores ? `${p.max_moradores} moradores` : 'moradores ilimitados'}</span>
                  <span className="muted-sm">{p.condominios} condomínio(s)</span>
                  {!p.ativo && <span className="muted-sm" style={{color:'var(--red)'}}>inativo</span>}
                </div>
                <div className="task-card-meta" style={{marginTop:'4px'}}>
                  {RECURSOS.filter((r) => recursos[r.chave]).map((r) => (
                    <span key={r.chave} className="muted-sm">✓ {r.label}</span>
                  ))}
                </div>
                <div className="task-actions">
                  <button className="btn btn-ghost btn-sm" onClick={() => editar(p)}>Editar</button>
                  {p.condominios === 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setConfirmar(p)}>Excluir</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form && (
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.72)',zIndex:200,
          display:'flex',alignItems:'center',justifyContent:'center',padding:'16px'}} onClick={() => setForm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background:'var(--s)',borderRadius:'16px',width:'100%',maxWidth:'560px',
            padding:'22px',maxHeight:'90vh',overflowY:'auto',
          }}>
            <h3 style={{fontFamily:'Syne,sans-serif',marginBottom:'14px'}}>{form.id ? 'Editar plano' : 'Novo plano'}</h3>
            <form onSubmit={salvar}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <Input label="Código" required value={form.codigo} disabled={!!form.id}
                  onChange={(e) => set('codigo', e.target.value.toLowerCase())} placeholder="essencial"/>
                <Input label="Nome" required value={form.nome} onChange={(e) => set('nome', e.target.value)}/>
              </div>
              <Input label="Descrição" value={form.descricao} onChange={(e) => set('descricao', e.target.value)}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
                <Input label="Preço mensal" type="number" step="0.01" min="0" required
                  value={form.preco_mensal} onChange={(e) => set('preco_mensal', e.target.value)}/>
                <Input label="Ordem de exibição" type="number" value={form.ordem} onChange={(e) => set('ordem', e.target.value)}/>
                <Input label="Máx. unidades" type="number" min="0" value={form.max_unidades}
                  onChange={(e) => set('max_unidades', e.target.value)} placeholder="vazio = ilimitado"/>
                <Input label="Máx. usuários internos" type="number" min="0" value={form.max_usuarios}
                  onChange={(e) => set('max_usuarios', e.target.value)} placeholder="vazio = ilimitado"/>
                <Input label="Máx. moradores" type="number" min="0" value={form.max_moradores}
                  onChange={(e) => set('max_moradores', e.target.value)} placeholder="vazio = ilimitado"/>
              </div>

              <div className="form-group">
                <label className="form-label">Recursos inclusos</label>
                {RECURSOS.map((r) => (
                  <label key={r.chave} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',padding:'3px 0'}}>
                    <input type="checkbox" checked={Boolean(form.recursos[r.chave])}
                      onChange={(e) => set('recursos', { ...form.recursos, [r.chave]: e.target.checked })}/>
                    {r.label}
                  </label>
                ))}
                <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',padding:'8px 0 0'}}>
                  <input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)}/>
                  Plano disponível para novas vendas
                </label>
              </div>

              <div style={{display:'flex',gap:'10px',marginTop:'12px'}}>
                <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{flex:1}}>Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog open={!!confirmar} danger
        title="Excluir plano?" message={`O plano "${confirmar?.nome}" será removido.`}
        onConfirm={async () => {
          try { await api.provedor.excluirPlano(confirmar.id); toast('Plano removido.', 'info'); carregar(); }
          catch (e) { toast(e.message, 'error'); }
          setConfirmar(null);
        }}
        onCancel={() => setConfirmar(null)}/>
    </ProvedorLayout>
  );
}
