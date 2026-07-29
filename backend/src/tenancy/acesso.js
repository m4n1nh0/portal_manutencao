/**
 * Regras comerciais de acesso ao condominio.
 *
 * Traduz o status do contrato em tres decisoes objetivas:
 *   - permiteLogin  : a porta esta aberta?
 *   - somenteLeitura: pode ver, mas nao pode alterar?
 *   - mensagem      : o que mostrar ao usuario
 *
 * Escada de bloqueio pensada para nao perder cliente por atraso bobo:
 *   trial -> ativo -> inadimplente (somente leitura) -> suspenso (sem acesso)
 */

const ESTADOS = {
  TRIAL: 'trial',
  ATIVO: 'ativo',
  INADIMPLENTE: 'inadimplente',
  SUSPENSO: 'suspenso',
  CANCELADO: 'cancelado',
};

function diasAte(data) {
  if (!data) return null;
  const alvo = new Date(data);
  if (Number.isNaN(alvo.getTime())) return null;
  const hoje = new Date();
  alvo.setHours(23, 59, 59, 999);
  hoje.setHours(0, 0, 0, 0);
  return Math.ceil((alvo - hoje) / 86400000);
}

function avaliarContrato(condominio) {
  if (!condominio) {
    return { estado: ESTADOS.CANCELADO, permiteLogin: false, somenteLeitura: true, mensagem: 'Condominio nao encontrado.', diasRestantes: null };
  }

  if (!condominio.ativo || condominio.status === ESTADOS.CANCELADO) {
    return {
      estado: ESTADOS.CANCELADO,
      permiteLogin: false,
      somenteLeitura: true,
      mensagem: 'Contrato encerrado. Fale com o suporte comercial para reativar o acesso.',
      diasRestantes: null,
    };
  }

  if (condominio.status === ESTADOS.SUSPENSO) {
    return {
      estado: ESTADOS.SUSPENSO,
      permiteLogin: false,
      somenteLeitura: true,
      mensagem: 'Acesso suspenso por pendencia financeira. Regularize para liberar o portal.',
      diasRestantes: null,
    };
  }

  if (condominio.status === ESTADOS.TRIAL) {
    const restantes = diasAte(condominio.trial_expira_em);
    if (restantes === null || restantes >= 0) {
      return {
        estado: ESTADOS.TRIAL,
        permiteLogin: true,
        somenteLeitura: false,
        mensagem: restantes === null
          ? 'Periodo de avaliacao.'
          : `Periodo de avaliacao: ${restantes} dia(s) restante(s).`,
        diasRestantes: restantes,
      };
    }
    return {
      estado: ESTADOS.INADIMPLENTE,
      permiteLogin: true,
      somenteLeitura: Boolean(condominio.bloqueio_automatico),
      mensagem: 'Periodo de avaliacao encerrado. Contrate um plano para voltar a editar.',
      diasRestantes: restantes,
    };
  }

  if (condominio.status === ESTADOS.INADIMPLENTE) {
    return {
      estado: ESTADOS.INADIMPLENTE,
      permiteLogin: true,
      somenteLeitura: Boolean(condominio.bloqueio_automatico),
      mensagem: 'Mensalidade em atraso. O portal esta em modo somente leitura ate a regularizacao.',
      diasRestantes: null,
    };
  }

  return { estado: ESTADOS.ATIVO, permiteLogin: true, somenteLeitura: false, mensagem: null, diasRestantes: null };
}

/**
 * Limites do plano. Retorna { permitido, limite, uso } — limite null = ilimitado.
 * `tipo`: 'usuarios' | 'moradores' | 'unidades'
 */
async function verificarLimite(db, condominio, tipo, incremento = 1) {
  const limites = {
    usuarios: condominio.max_usuarios,
    moradores: condominio.max_moradores,
    unidades: condominio.max_unidades,
  };
  const limite = limites[tipo];
  if (limite === null || limite === undefined) return { permitido: true, limite: null, uso: null };

  let uso = 0;
  if (tipo === 'unidades') {
    uso = condominio.total_unidades || 0;
  } else {
    const filtro = tipo === 'moradores' ? "perfil = 'morador'" : "perfil <> 'morador'";
    const [[row]] = await db.query(
      `SELECT COUNT(*) AS total FROM usuarios
       WHERE condominio_id = ? AND ativo = 1 AND status <> 'rejeitado' AND ${filtro}`,
      [condominio.id]
    );
    uso = row.total;
  }

  return { permitido: uso + incremento <= limite, limite, uso };
}

function recursoHabilitado(condominio, recurso) {
  const recursos = typeof condominio?.plano_recursos === 'string'
    ? JSON.parse(condominio.plano_recursos)
    : condominio?.plano_recursos;
  if (!recursos) return true; // sem plano cadastrado: nao bloqueia
  return recursos[recurso] !== false;
}

module.exports = { ESTADOS, avaliarContrato, verificarLimite, recursoHabilitado, diasAte };
