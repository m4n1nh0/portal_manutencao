-- ══════════════════════════════════════════════════════════════
--  MULTI-TENANCY + CAMADA COMERCIAL
--
--  Transforma o portal mono-condominio em SaaS multi-condominio:
--    1. Plano de controle: planos, condominios, faturas
--    2. condominio_id em todas as tabelas operacionais
--    3. Backfill dos dados existentes para o "Condominio Principal"
--    4. Chaves unicas passam a ser por condominio
--    5. Perfil superadmin (provedor do SaaS), sem condominio
--
--  Idempotente: cada ALTER e protegido por consulta ao
--  information_schema, entao a migration pode ser reexecutada.
-- ══════════════════════════════════════════════════════════════

-- ── 1. PLANOS COMERCIAIS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS planos (
  id            CHAR(36)      NOT NULL DEFAULT (UUID()),
  codigo        VARCHAR(30)   NOT NULL,
  nome          VARCHAR(80)   NOT NULL,
  descricao     VARCHAR(255)  NULL,
  preco_mensal  DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_unidades  INT           NULL COMMENT 'NULL = ilimitado',
  max_usuarios  INT           NULL COMMENT 'usuarios internos; NULL = ilimitado',
  max_moradores INT           NULL COMMENT 'NULL = ilimitado',
  recursos      JSON          NULL COMMENT 'flags de funcionalidades do plano',
  ordem         SMALLINT      NOT NULL DEFAULT 0,
  ativo         TINYINT(1)    NOT NULL DEFAULT 1,
  criado_em     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_planos_codigo (codigo),
  INDEX idx_planos_ativo (ativo, ordem)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 2. CONDOMINIOS (tenants) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS condominios (
  id             CHAR(36)     NOT NULL DEFAULT (UUID()),
  slug           VARCHAR(40)  NOT NULL COMMENT 'subdominio: <slug>.dominio.com.br',
  nome           VARCHAR(120) NOT NULL,
  razao_social   VARCHAR(160) NULL,
  cnpj           VARCHAR(18)  NULL,
  email_contato  VARCHAR(120) NULL,
  telefone       VARCHAR(20)  NULL,
  responsavel    VARCHAR(120) NULL COMMENT 'sindico ou contato comercial',

  -- Endereco
  cep            VARCHAR(9)   NULL,
  logradouro     VARCHAR(160) NULL,
  numero         VARCHAR(20)  NULL,
  complemento    VARCHAR(80)  NULL,
  bairro         VARCHAR(80)  NULL,
  cidade         VARCHAR(80)  NULL,
  uf             CHAR(2)      NULL,
  total_unidades INT          NULL,

  -- Identidade visual (white label)
  logo_url       TEXT         NULL,
  cor_primaria   VARCHAR(9)   NULL,

  -- Camada comercial
  plano_id            CHAR(36)      NULL,
  valor_mensal        DECIMAL(10,2) NULL COMMENT 'sobrepoe o preco do plano quando preenchido',
  status              ENUM('trial','ativo','inadimplente','suspenso','cancelado')
                      NOT NULL DEFAULT 'trial',
  trial_expira_em     DATE          NULL,
  contrato_inicio     DATE          NULL,
  contrato_fim        DATE          NULL,
  dia_vencimento      TINYINT       NOT NULL DEFAULT 10,
  dias_tolerancia     INT           NOT NULL DEFAULT 5 COMMENT 'dias apos o vencimento antes de bloquear',
  bloqueio_automatico TINYINT(1)    NOT NULL DEFAULT 1,
  observacoes         TEXT          NULL,

  -- Infraestrutura (preparado para separar bancos no futuro)
  isolamento      ENUM('compartilhado','dedicado') NOT NULL DEFAULT 'compartilhado',
  db_config       JSON     NULL COMMENT 'host/port/user/password/database quando isolamento=dedicado',
  provisionado_em DATETIME NULL,

  ativo         TINYINT(1) NOT NULL DEFAULT 1,
  criado_em     DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_condominios_slug (slug),
  UNIQUE KEY uq_condominios_cnpj (cnpj),
  INDEX idx_condominios_status (status),
  INDEX idx_condominios_plano (plano_id),
  CONSTRAINT fk_condominio_plano FOREIGN KEY (plano_id)
    REFERENCES planos(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 3. FATURAS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS condominio_faturas (
  id            CHAR(36)      NOT NULL DEFAULT (UUID()),
  condominio_id CHAR(36)      NOT NULL,
  competencia   CHAR(7)       NOT NULL COMMENT 'AAAA-MM',
  descricao     VARCHAR(160)  NULL,
  valor         DECIMAL(10,2) NOT NULL,
  vencimento    DATE          NOT NULL,
  pago_em       DATE          NULL,
  valor_pago    DECIMAL(10,2) NULL,
  metodo        VARCHAR(40)   NULL,
  status        ENUM('aberta','paga','vencida','cancelada') NOT NULL DEFAULT 'aberta',
  observacao    TEXT          NULL,
  criado_em     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fatura_competencia (condominio_id, competencia),
  INDEX idx_fatura_status (status, vencimento),
  CONSTRAINT fk_fatura_condominio FOREIGN KEY (condominio_id)
    REFERENCES condominios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 4. PLANOS PADRAO ─────────────────────────────────────────
INSERT INTO planos (codigo,nome,descricao,preco_mensal,max_unidades,max_usuarios,max_moradores,recursos,ordem) VALUES
  ('essencial','Essencial','Ate 150 unidades. Tarefas, ciclo e comprovacao fotografica.',
   349.00, 150, 10, 200,
   JSON_OBJECT('agendamento',true,'kanban',true,'auditoria',false,'2fa',false,'marca_propria',false), 1),
  ('profissional','Profissional','Ate 500 unidades. Inclui auditoria, 2FA e agendamento automatico.',
   690.00, 500, 30, 800,
   JSON_OBJECT('agendamento',true,'kanban',true,'auditoria',true,'2fa',true,'marca_propria',false), 2),
  ('enterprise','Enterprise','Unidades ilimitadas, marca propria e suporte dedicado.',
   1290.00, NULL, NULL, NULL,
   JSON_OBJECT('agendamento',true,'kanban',true,'auditoria',true,'2fa',true,'marca_propria',true), 3)
ON DUPLICATE KEY UPDATE
  nome = VALUES(nome), descricao = VALUES(descricao), ordem = VALUES(ordem);

-- ── 5. CONDOMINIO PADRAO (recebe os dados ja existentes) ─────
INSERT IGNORE INTO condominios
  (id, slug, nome, razao_social, status, contrato_inicio, dia_vencimento, plano_id, provisionado_em)
SELECT '11111111-1111-1111-1111-111111111111', 'principal', 'Condominio Principal',
       'Condominio Principal', 'ativo', CURDATE(), 10, p.id, NOW()
FROM planos p WHERE p.codigo = 'profissional';

-- ── 6. COLUNA condominio_id NAS TABELAS OPERACIONAIS ─────────
-- Padrao repetido: so aplica o ALTER se a coluna ainda nao existir.

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE usuarios ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sessoes' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE sessoes ADD COLUMN condominio_id CHAR(36) NULL AFTER usuario_id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_log' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE audit_log ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ciclo_8dias' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE ciclo_8dias ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ciclo_atividades' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE ciclo_atividades ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='quadras' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE quadras ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ruas' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE ruas ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='equipes' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE equipes ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='locais' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE locais ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tarefa_modelos' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE tarefa_modelos ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tarefas' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE tarefas ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='historico_tarefas' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE historico_tarefas ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='comprovacoes' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE comprovacoes ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='observacoes_moradores' AND COLUMN_NAME='condominio_id'),
  'SELECT 1', 'ALTER TABLE observacoes_moradores ADD COLUMN condominio_id CHAR(36) NULL AFTER id');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

-- ── 7. PERFIL superadmin ─────────────────────────────────────
-- Precisa vir antes do backfill: o provedor do SaaS e o unico usuario
-- que fica sem condominio, e o backfill precisa saber ignora-lo.
ALTER TABLE usuarios MODIFY COLUMN perfil
  ENUM('superadmin','admin','supervisor','sindico','subsindico','conselho','morador','campo')
  NOT NULL DEFAULT 'morador';

-- ── 8. BACKFILL ──────────────────────────────────────────────
SET @cond := '11111111-1111-1111-1111-111111111111';

UPDATE usuarios              SET condominio_id = @cond WHERE condominio_id IS NULL AND perfil <> 'superadmin';
UPDATE ciclo_8dias           SET condominio_id = @cond WHERE condominio_id IS NULL;
UPDATE quadras               SET condominio_id = @cond WHERE condominio_id IS NULL;
UPDATE equipes               SET condominio_id = @cond WHERE condominio_id IS NULL;
UPDATE locais                SET condominio_id = @cond WHERE condominio_id IS NULL;
UPDATE tarefa_modelos        SET condominio_id = @cond WHERE condominio_id IS NULL;
UPDATE tarefas               SET condominio_id = @cond WHERE condominio_id IS NULL;

-- Tabelas filhas herdam o condominio do pai
UPDATE ciclo_atividades a JOIN ciclo_8dias c ON c.id = a.ciclo_id
  SET a.condominio_id = c.condominio_id WHERE a.condominio_id IS NULL;
UPDATE ruas r JOIN quadras q ON q.id = r.quadra_id
  SET r.condominio_id = q.condominio_id WHERE r.condominio_id IS NULL;
UPDATE historico_tarefas h JOIN tarefas t ON t.id = h.tarefa_id
  SET h.condominio_id = t.condominio_id WHERE h.condominio_id IS NULL;
UPDATE comprovacoes cp JOIN tarefas t ON t.id = cp.tarefa_id
  SET cp.condominio_id = t.condominio_id WHERE cp.condominio_id IS NULL;
UPDATE sessoes s JOIN usuarios u ON u.id = s.usuario_id
  SET s.condominio_id = u.condominio_id WHERE s.condominio_id IS NULL;
UPDATE observacoes_moradores o LEFT JOIN usuarios u ON u.id = o.usuario_id
  SET o.condominio_id = COALESCE(u.condominio_id, @cond) WHERE o.condominio_id IS NULL;
UPDATE audit_log a JOIN usuarios u ON u.id = a.usuario_id
  SET a.condominio_id = u.condominio_id WHERE a.condominio_id IS NULL;

-- Sobras (registros orfaos) vao para o condominio padrao
UPDATE ciclo_atividades      SET condominio_id = @cond WHERE condominio_id IS NULL;
UPDATE ruas                  SET condominio_id = @cond WHERE condominio_id IS NULL;
UPDATE historico_tarefas     SET condominio_id = @cond WHERE condominio_id IS NULL;
UPDATE comprovacoes          SET condominio_id = @cond WHERE condominio_id IS NULL;
UPDATE observacoes_moradores SET condominio_id = @cond WHERE condominio_id IS NULL;

-- ── 9. NOT NULL + CHAVES ESTRANGEIRAS ────────────────────────
-- usuarios e audit_log permanecem NULL-aveis: o superadmin (provedor)
-- nao pertence a nenhum condominio.

ALTER TABLE ciclo_8dias           MODIFY COLUMN condominio_id CHAR(36) NOT NULL;
ALTER TABLE ciclo_atividades      MODIFY COLUMN condominio_id CHAR(36) NOT NULL;
ALTER TABLE quadras               MODIFY COLUMN condominio_id CHAR(36) NOT NULL;
ALTER TABLE ruas                  MODIFY COLUMN condominio_id CHAR(36) NOT NULL;
ALTER TABLE equipes               MODIFY COLUMN condominio_id CHAR(36) NOT NULL;
ALTER TABLE locais                MODIFY COLUMN condominio_id CHAR(36) NOT NULL;
ALTER TABLE tarefa_modelos        MODIFY COLUMN condominio_id CHAR(36) NOT NULL;
ALTER TABLE tarefas               MODIFY COLUMN condominio_id CHAR(36) NOT NULL;
ALTER TABLE historico_tarefas     MODIFY COLUMN condominio_id CHAR(36) NOT NULL;
ALTER TABLE comprovacoes          MODIFY COLUMN condominio_id CHAR(36) NOT NULL;
ALTER TABLE observacoes_moradores MODIFY COLUMN condominio_id CHAR(36) NOT NULL;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND CONSTRAINT_NAME='fk_usuarios_condominio'),
  'SELECT 1', 'ALTER TABLE usuarios ADD CONSTRAINT fk_usuarios_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='sessoes' AND CONSTRAINT_NAME='fk_sessoes_condominio'),
  'SELECT 1', 'ALTER TABLE sessoes ADD CONSTRAINT fk_sessoes_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_log' AND CONSTRAINT_NAME='fk_audit_condominio'),
  'SELECT 1', 'ALTER TABLE audit_log ADD CONSTRAINT fk_audit_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE SET NULL');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ciclo_8dias' AND CONSTRAINT_NAME='fk_ciclo_condominio'),
  'SELECT 1', 'ALTER TABLE ciclo_8dias ADD CONSTRAINT fk_ciclo_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ciclo_atividades' AND CONSTRAINT_NAME='fk_ciclo_atv_condominio'),
  'SELECT 1', 'ALTER TABLE ciclo_atividades ADD CONSTRAINT fk_ciclo_atv_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='quadras' AND CONSTRAINT_NAME='fk_quadras_condominio'),
  'SELECT 1', 'ALTER TABLE quadras ADD CONSTRAINT fk_quadras_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ruas' AND CONSTRAINT_NAME='fk_ruas_condominio'),
  'SELECT 1', 'ALTER TABLE ruas ADD CONSTRAINT fk_ruas_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='equipes' AND CONSTRAINT_NAME='fk_equipes_condominio'),
  'SELECT 1', 'ALTER TABLE equipes ADD CONSTRAINT fk_equipes_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='locais' AND CONSTRAINT_NAME='fk_locais_condominio'),
  'SELECT 1', 'ALTER TABLE locais ADD CONSTRAINT fk_locais_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tarefa_modelos' AND CONSTRAINT_NAME='fk_modelos_condominio'),
  'SELECT 1', 'ALTER TABLE tarefa_modelos ADD CONSTRAINT fk_modelos_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tarefas' AND CONSTRAINT_NAME='fk_tarefas_condominio'),
  'SELECT 1', 'ALTER TABLE tarefas ADD CONSTRAINT fk_tarefas_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='historico_tarefas' AND CONSTRAINT_NAME='fk_hist_condominio'),
  'SELECT 1', 'ALTER TABLE historico_tarefas ADD CONSTRAINT fk_hist_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='comprovacoes' AND CONSTRAINT_NAME='fk_comp_condominio'),
  'SELECT 1', 'ALTER TABLE comprovacoes ADD CONSTRAINT fk_comp_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='observacoes_moradores' AND CONSTRAINT_NAME='fk_obs_condominio'),
  'SELECT 1', 'ALTER TABLE observacoes_moradores ADD CONSTRAINT fk_obs_condominio FOREIGN KEY (condominio_id) REFERENCES condominios(id) ON DELETE CASCADE');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

-- ── 10. UNICIDADE POR CONDOMINIO ─────────────────────────────
-- usuarios: login/email deixam de ser unicos globalmente e passam a ser
-- unicos dentro do condominio. tenant_key troca o NULL do superadmin por
-- um sentinela, porque em MySQL varios NULLs nao colidem em UNIQUE.
--
-- VIRTUAL, nao STORED: coluna gerada STORED obriga ALGORITHM=COPY, e copiar
-- uma tabela que e PAI de chaves estrangeiras (usuarios e referenciada por
-- tarefas, sessoes, comprovacoes, historico_tarefas, observacoes_moradores e
-- por ela mesma via aprovado_por) falha com ER_CANNOT_ADD_FOREIGN (1215).
-- VIRTUAL e adicionada INPLACE e continua indexavel: o indice unico
-- materializa o valor e a unicidade e garantida do mesmo jeito.
SET @s := IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND COLUMN_NAME='tenant_key'),
  'SELECT 1',
  'ALTER TABLE usuarios ADD COLUMN tenant_key CHAR(36) GENERATED ALWAYS AS (COALESCE(condominio_id,''00000000-0000-0000-0000-000000000000'')) VIRTUAL');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND INDEX_NAME='login'),
  'ALTER TABLE usuarios DROP INDEX login', 'SELECT 1');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND INDEX_NAME='email'),
  'ALTER TABLE usuarios DROP INDEX email', 'SELECT 1');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND INDEX_NAME='uq_usuarios_tenant_login'),
  'SELECT 1', 'ALTER TABLE usuarios ADD UNIQUE KEY uq_usuarios_tenant_login (tenant_key, login)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND INDEX_NAME='uq_usuarios_tenant_email'),
  'SELECT 1', 'ALTER TABLE usuarios ADD UNIQUE KEY uq_usuarios_tenant_email (tenant_key, email)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

-- quadras.codigo
SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='quadras' AND INDEX_NAME='uq_quadras_codigo'),
  'ALTER TABLE quadras DROP INDEX uq_quadras_codigo', 'SELECT 1');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='quadras' AND INDEX_NAME='uq_quadras_cond_codigo'),
  'SELECT 1', 'ALTER TABLE quadras ADD UNIQUE KEY uq_quadras_cond_codigo (condominio_id, codigo)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

-- equipes.nome
SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='equipes' AND INDEX_NAME='uq_equipes_nome'),
  'ALTER TABLE equipes DROP INDEX uq_equipes_nome', 'SELECT 1');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='equipes' AND INDEX_NAME='uq_equipes_cond_nome'),
  'SELECT 1', 'ALTER TABLE equipes ADD UNIQUE KEY uq_equipes_cond_nome (condominio_id, nome)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

-- locais.nome
SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='locais' AND INDEX_NAME='uq_locais_nome'),
  'ALTER TABLE locais DROP INDEX uq_locais_nome', 'SELECT 1');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='locais' AND INDEX_NAME='uq_locais_cond_nome'),
  'SELECT 1', 'ALTER TABLE locais ADD UNIQUE KEY uq_locais_cond_nome (condominio_id, nome)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

-- ciclo_8dias.dia_ciclo
SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ciclo_8dias' AND INDEX_NAME='uq_dia'),
  'ALTER TABLE ciclo_8dias DROP INDEX uq_dia', 'SELECT 1');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='ciclo_8dias' AND INDEX_NAME='uq_ciclo_cond_dia'),
  'SELECT 1', 'ALTER TABLE ciclo_8dias ADD UNIQUE KEY uq_ciclo_cond_dia (condominio_id, dia_ciclo)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

-- tarefa_modelos
SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tarefa_modelos' AND INDEX_NAME='uq_modelo_tarefa'),
  'ALTER TABLE tarefa_modelos DROP INDEX uq_modelo_tarefa', 'SELECT 1');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tarefa_modelos' AND INDEX_NAME='uq_modelo_cond_tarefa'),
  'SELECT 1', 'ALTER TABLE tarefa_modelos ADD UNIQUE KEY uq_modelo_cond_tarefa (condominio_id, ciclo, setor, area, atividade(160))');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

-- ── 11. INDICES DE LEITURA POR TENANT ────────────────────────
SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tarefas' AND INDEX_NAME='idx_tarefas_cond_ciclo'),
  'SELECT 1', 'ALTER TABLE tarefas ADD INDEX idx_tarefas_cond_ciclo (condominio_id, ciclo, status)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tarefas' AND INDEX_NAME='idx_tarefas_cond_agenda'),
  'SELECT 1', 'ALTER TABLE tarefas ADD INDEX idx_tarefas_cond_agenda (condominio_id, data_agendada)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='usuarios' AND INDEX_NAME='idx_usuarios_cond_perfil'),
  'SELECT 1', 'ALTER TABLE usuarios ADD INDEX idx_usuarios_cond_perfil (condominio_id, perfil, status)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='audit_log' AND INDEX_NAME='idx_audit_cond_ts'),
  'SELECT 1', 'ALTER TABLE audit_log ADD INDEX idx_audit_cond_ts (condominio_id, criado_em)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='comprovacoes' AND INDEX_NAME='idx_comp_cond_ts'),
  'SELECT 1', 'ALTER TABLE comprovacoes ADD INDEX idx_comp_cond_ts (condominio_id, enviado_em)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;

SET @s := IF(EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='observacoes_moradores' AND INDEX_NAME='idx_obs_cond_ts'),
  'SELECT 1', 'ALTER TABLE observacoes_moradores ADD INDEX idx_obs_cond_ts (condominio_id, criado_em)');
PREPARE ps FROM @s; EXECUTE ps; DEALLOCATE PREPARE ps;
