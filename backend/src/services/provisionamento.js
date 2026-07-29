/**
 * Provisionamento de um condominio novo.
 *
 * Cria o conteudo inicial (ciclo, quadras, equipes, locais, modelos de
 * tarefa) a partir do catalogo padrao ou clonando um condominio existente,
 * e cadastra o primeiro usuario administrativo do cliente.
 *
 * A copia passa pelo Node em vez de INSERT ... SELECT de proposito: assim
 * funciona igual quando origem e destino estiverem em bancos diferentes.
 */
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const registry = require('../tenancy/registry');
const logger = require('../config/logger');
const catalogo = require('./catalogoBase');

const PERFIS_ADMINISTRATIVOS = ['admin', 'supervisor', 'sindico', 'subsindico', 'conselho', 'campo'];

function prioridadeTarefa(valor) {
  if (valor === 'Media') return 'Média';
  return ['Alta', 'Média', 'Baixa'].includes(valor) ? valor : '';
}

/** Le o catalogo de um condominio ja existente, para clonar a configuracao. */
async function lerCatalogo(condominioOrigem) {
  const db = registry.dbPara(condominioOrigem);
  const id = condominioOrigem.id;

  const [dias] = await db.query(
    'SELECT id,dia_ciclo,setor,trecho FROM ciclo_8dias WHERE condominio_id=? ORDER BY dia_ciclo',
    [id]
  );
  const [atividades] = await db.query(
    'SELECT ciclo_id,ordem,titulo,descricao,equipe,prioridade FROM ciclo_atividades WHERE condominio_id=? AND ativo=1 ORDER BY ciclo_id,ordem',
    [id]
  );
  const [quadras] = await db.query(
    'SELECT id,codigo,nome,descricao FROM quadras WHERE condominio_id=? ORDER BY codigo',
    [id]
  );
  const [ruas] = await db.query(
    'SELECT quadra_id,nome,ordem FROM ruas WHERE condominio_id=? ORDER BY quadra_id,ordem',
    [id]
  );
  const [equipes] = await db.query(
    'SELECT nome,tipo,contato FROM equipes WHERE condominio_id=? ORDER BY nome',
    [id]
  );
  const [locais] = await db.query(
    'SELECT nome,categoria,descricao FROM locais WHERE condominio_id=? ORDER BY nome',
    [id]
  );
  const [modelos] = await db.query(
    'SELECT ciclo,setor,area,atividade,equipe,prioridade FROM tarefa_modelos WHERE condominio_id=? AND ativo=1 ORDER BY ciclo,setor',
    [id]
  );

  return {
    CICLO: dias.map((dia) => ({
      dia_ciclo: dia.dia_ciclo,
      setor: dia.setor,
      trecho: dia.trecho,
      atividades: atividades.filter((a) => a.ciclo_id === dia.id),
    })),
    QUADRAS: quadras.map((quadra) => ({
      codigo: quadra.codigo,
      nome: quadra.nome,
      descricao: quadra.descricao,
      ruas: ruas.filter((r) => r.quadra_id === quadra.id),
    })),
    EQUIPES: equipes,
    LOCAIS: locais,
    MODELOS: modelos,
  };
}

/**
 * @param {object} condominio linha da tabela condominios
 * @param {object} opcoes
 * @param {'padrao'|'vazio'|string} opcoes.modelo 'padrao', 'vazio' ou o id de um condominio a clonar
 * @param {boolean} opcoes.gerarTarefas cria o primeiro lote de tarefas a partir dos modelos
 */
async function provisionar(condominio, { modelo = 'padrao', gerarTarefas = false } = {}) {
  const resumo = { ciclo: 0, atividades: 0, quadras: 0, ruas: 0, equipes: 0, locais: 0, modelos: 0, tarefas: 0 };
  if (modelo === 'vazio') {
    await marcarProvisionado(condominio.id);
    return resumo;
  }

  let fonte = catalogo;
  if (modelo !== 'padrao') {
    const origem = await registry.buscarPorId(modelo);
    if (!origem) throw Object.assign(new Error('Condominio modelo nao encontrado.'), { status: 404 });
    fonte = await lerCatalogo(origem);
  }

  const db = registry.dbPara(condominio);
  const cid = condominio.id;

  await db.transaction(async (tx) => {
    // ── Ciclo ──
    for (const dia of fonte.CICLO) {
      const [r] = await tx.query(
        'INSERT IGNORE INTO ciclo_8dias (condominio_id,dia_ciclo,setor,trecho) VALUES (?,?,?,?)',
        [cid, dia.dia_ciclo, dia.setor, dia.trecho || null]
      );
      if (!r.insertId) continue; // dia ja existia
      resumo.ciclo += 1;
      for (const atividade of dia.atividades || []) {
        await tx.query(
          `INSERT INTO ciclo_atividades (id,condominio_id,ciclo_id,ordem,titulo,descricao,equipe,prioridade,ativo)
           VALUES (?,?,?,?,?,?,?,?,1)`,
          [uuidv4(), cid, r.insertId, atividade.ordem, atividade.titulo, atividade.descricao,
           atividade.equipe || null, atividade.prioridade || '']
        );
        resumo.atividades += 1;
      }
    }

    // ── Quadras e ruas ──
    for (const quadra of fonte.QUADRAS) {
      const quadraId = uuidv4();
      const [r] = await tx.query(
        'INSERT IGNORE INTO quadras (id,condominio_id,codigo,nome,descricao) VALUES (?,?,?,?,?)',
        [quadraId, cid, quadra.codigo, quadra.nome, quadra.descricao || null]
      );
      if (!r.affectedRows) continue;
      resumo.quadras += 1;
      for (const rua of quadra.ruas || []) {
        await tx.query(
          'INSERT IGNORE INTO ruas (id,condominio_id,quadra_id,nome,ordem) VALUES (?,?,?,?,?)',
          [uuidv4(), cid, quadraId, rua.nome, rua.ordem]
        );
        resumo.ruas += 1;
      }
    }

    // ── Equipes ──
    for (const equipe of fonte.EQUIPES) {
      const [r] = await tx.query(
        'INSERT IGNORE INTO equipes (id,condominio_id,nome,tipo,contato) VALUES (?,?,?,?,?)',
        [uuidv4(), cid, equipe.nome, equipe.tipo || null, equipe.contato || null]
      );
      resumo.equipes += r.affectedRows ? 1 : 0;
    }

    // ── Locais ──
    for (const local of fonte.LOCAIS) {
      const [r] = await tx.query(
        'INSERT IGNORE INTO locais (id,condominio_id,nome,categoria,descricao) VALUES (?,?,?,?,?)',
        [uuidv4(), cid, local.nome, local.categoria || null, local.descricao || null]
      );
      resumo.locais += r.affectedRows ? 1 : 0;
    }

    // ── Modelos de tarefa ──
    for (const m of fonte.MODELOS) {
      const [r] = await tx.query(
        `INSERT IGNORE INTO tarefa_modelos (id,condominio_id,ciclo,setor,area,atividade,equipe,prioridade,ativo)
         VALUES (?,?,?,?,?,?,?,?,1)`,
        [uuidv4(), cid, m.ciclo, m.setor, m.area || '', m.atividade, m.equipe || '', m.prioridade || '']
      );
      resumo.modelos += r.affectedRows ? 1 : 0;
    }

    // ── Primeiro lote de tarefas (opcional) ──
    if (gerarTarefas) {
      const [modelos] = await tx.query(
        'SELECT ciclo,setor,area,atividade,equipe,prioridade FROM tarefa_modelos WHERE condominio_id=? AND ativo=1',
        [cid]
      );
      for (const m of modelos) {
        await tx.query(
          `INSERT INTO tarefas
            (id,condominio_id,ciclo,setor,area,atividade,equipe,prioridade,status,observacoes,data_agendada,data_limite,origem_agendamento)
           VALUES (?,?,?,?,?,?,?,?,'Pendente','Gerada no provisionamento do condominio.',CURDATE(),CURDATE(),'provisionamento')`,
          [uuidv4(), cid, m.ciclo, m.setor, m.area || '', m.atividade, m.equipe || '', prioridadeTarefa(m.prioridade)]
        );
        resumo.tarefas += 1;
      }
    }
  });

  await marcarProvisionado(cid);
  registry.invalidar(condominio);
  logger.info('Condominio provisionado', { condominio: condominio.slug, modelo, resumo });
  return resumo;
}

async function marcarProvisionado(condominioId) {
  await registry.poolPrincipal.query(
    'UPDATE condominios SET provisionado_em = COALESCE(provisionado_em, NOW()) WHERE id = ?',
    [condominioId]
  );
}

/** Cria o primeiro usuario administrativo do condominio. */
async function criarAdministrador(condominio, { login, nome, email, senha, perfil = 'sindico', telefone = null }) {
  if (!PERFIS_ADMINISTRATIVOS.includes(perfil)) {
    throw Object.assign(new Error('Perfil invalido para usuario administrativo.'), { status: 400 });
  }

  const db = registry.dbPara(condominio);
  const [[existente]] = await db.query(
    'SELECT id FROM usuarios WHERE condominio_id=? AND (login=? OR email=?)',
    [condominio.id, login, email]
  );
  if (existente) {
    throw Object.assign(new Error('Login ou e-mail ja cadastrado neste condominio.'), { status: 409 });
  }

  const id = uuidv4();
  const hash = await bcrypt.hash(senha, 12);
  await db.query(
    `INSERT INTO usuarios (id,condominio_id,login,nome,email,telefone,senha_hash,perfil,status)
     VALUES (?,?,?,?,?,?,?,?,'aprovado')`,
    [id, condominio.id, login, nome, email, telefone, hash, perfil]
  );

  logger.info('Administrador inicial criado', { condominio: condominio.slug, login, perfil });
  return { id, login, nome, email, perfil };
}

module.exports = { provisionar, criarAdministrador, lerCatalogo, PERFIS_ADMINISTRATIVOS };
