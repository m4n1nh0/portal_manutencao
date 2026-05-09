import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { PasswordInput, SenhaForca } from '../components/UI';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import api from '../utils/api';
import { getRoleInfo, validaSenha } from '../utils/auth';

export default function Perfil() {
  const { user, refreshUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [perfil, setPerfil] = useState({ nome:'', email:'', telefone:'', unidade:'' });
  const [saving, setSaving] = useState(false);
  const [senha, setSenha] = useState({ atual:'', nova:'', confirma:'' });
  const [changing, setChanging] = useState(false);
  const [twofaLoading, setTwofaLoading] = useState(false);

  const role = getRoleInfo(user?.perfil);
  const twofaEnabled = Boolean(Number(user?.twofa_habilitado));
  const senhaErros = useMemo(() => validaSenha(senha.nova || ''), [senha.nova]);

  useEffect(() => {
    setPerfil({
      nome: user?.nome || '',
      email: user?.email || '',
      telefone: user?.telefone || '',
      unidade: user?.unidade || '',
    });
  }, [user]);

  function setPerfilField(field, value) {
    setPerfil(prev => ({ ...prev, [field]: value }));
  }

  function setSenhaField(field, value) {
    setSenha(prev => ({ ...prev, [field]: value }));
  }

  async function salvarPerfil(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateProfile(perfil);
      await refreshUser();
      toast('Perfil atualizado.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function trocarSenha(e) {
    e.preventDefault();
    if (!senha.atual || !senha.nova || !senha.confirma) {
      toast('Preencha todos os campos de senha.', 'error');
      return;
    }
    if (senha.nova !== senha.confirma) {
      toast('A confirmacao precisa ser igual a nova senha.', 'error');
      return;
    }
    if (senhaErros.length) {
      toast(`A nova senha precisa ter: ${senhaErros.join(', ')}.`, 'error');
      return;
    }

    setChanging(true);
    try {
      await api.changePassword(senha.atual, senha.nova);
      toast('Senha alterada. Faca login novamente.', 'success');
      setSenha({ atual:'', nova:'', confirma:'' });
      await logout();
      navigate('/login', { replace:true });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setChanging(false);
    }
  }

  async function alternar2fa() {
    setTwofaLoading(true);
    try {
      const res = await api.toggle2fa();
      await refreshUser();
      toast(res.mensagem || 'Duplo fator atualizado.', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setTwofaLoading(false);
    }
  }

  return (
    <Layout title="Minha conta">
      <section className="account-hero">
        <div className="account-avatar">{role.emoji}</div>
        <div className="account-copy">
          <span className="account-eyebrow">{role.label}</span>
          <h2>{user?.nome || 'Usuario'}</h2>
          <p>{user?.email || 'Sem e-mail cadastrado'}</p>
        </div>
        <div className={`account-state ${twofaEnabled ? 'on' : 'off'}`}>
          <span>{twofaEnabled ? '2FA ativo' : '2FA inativo'}</span>
        </div>
      </section>

      <div className="account-grid">
        <form className="settings-card" onSubmit={salvarPerfil}>
          <div className="settings-head">
            <div>
              <h3>Editar perfil</h3>
              <p>Dados usados na operacao e nas notificacoes.</p>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Nome</label>
            <input
              className="form-control"
              value={perfil.nome}
              onChange={e => setPerfilField('nome', e.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">E-mail</label>
            <input
              className="form-control"
              type="email"
              value={perfil.email}
              onChange={e => setPerfilField('email', e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="account-form-row">
            <div className="form-group">
              <label className="form-label">Telefone</label>
              <input
                className="form-control"
                value={perfil.telefone}
                onChange={e => setPerfilField('telefone', e.target.value)}
                autoComplete="tel"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Unidade</label>
              <input
                className="form-control"
                value={perfil.unidade}
                onChange={e => setPerfilField('unidade', e.target.value)}
              />
            </div>
          </div>

          <div className="settings-actions">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar perfil'}
            </button>
          </div>
        </form>

        <div className="settings-stack">
          <form className="settings-card" onSubmit={trocarSenha}>
            <div className="settings-head">
              <div>
                <h3>Trocar senha</h3>
                <p>Apos alterar, a sessao atual sera encerrada.</p>
              </div>
            </div>
            <PasswordInput
              label="Senha atual"
              value={senha.atual}
              onChange={e => setSenhaField('atual', e.target.value)}
              autoComplete="current-password"
              required
            />
            <PasswordInput
              label="Nova senha"
              value={senha.nova}
              onChange={e => setSenhaField('nova', e.target.value)}
              autoComplete="new-password"
              required
            />
            <SenhaForca senha={senha.nova} />
            <PasswordInput
              label="Confirmar nova senha"
              value={senha.confirma}
              onChange={e => setSenhaField('confirma', e.target.value)}
              autoComplete="new-password"
              required
            />
            <div className="settings-actions">
              <button className="btn btn-warning" type="submit" disabled={changing}>
                {changing ? 'Alterando...' : 'Alterar senha'}
              </button>
            </div>
          </form>

          <section className="settings-card">
            <div className="settings-head">
              <div>
                <h3>Duplo fator</h3>
                <p>Quando ativo, o login pede um codigo enviado por e-mail.</p>
              </div>
            </div>
            <div className="twofa-panel">
              <div>
                <span className="twofa-label">Status</span>
                <strong>{twofaEnabled ? 'Protecao ativa' : 'Protecao desativada'}</strong>
              </div>
              <span className={`twofa-dot ${twofaEnabled ? 'on' : 'off'}`} />
            </div>
            <button
              className={`btn ${twofaEnabled ? 'btn-ghost' : 'btn-primary'} btn-full`}
              type="button"
              onClick={alternar2fa}
              disabled={twofaLoading}
            >
              {twofaLoading ? 'Atualizando...' : twofaEnabled ? 'Desativar 2FA' : 'Ativar 2FA'}
            </button>
            <p className="settings-note">
              Em producao, configure SMTP para que o codigo chegue no e-mail do usuario.
            </p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
