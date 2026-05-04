-- ══════════════════════════════════════════════════════════════
--  PORTAL DE MANUTENÇÃO v4 — Schema MySQL 8+
--  Inclui: registro de moradores, 2FA, brute force, audit log
-- ══════════════════════════════════════════════════════════════

-- Database creation/selection is handled by backend/scripts/migrate.js.

-- ── USUÁRIOS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                CHAR(36)      NOT NULL DEFAULT (UUID()),
  login             VARCHAR(50)   NOT NULL UNIQUE,
  nome              VARCHAR(120)  NOT NULL,
  email             VARCHAR(120)  NOT NULL UNIQUE,
  telefone          VARCHAR(20)   NULL,
  cpf               VARCHAR(14)   NULL,
  senha_hash        TEXT          NOT NULL,
  perfil            ENUM('admin','supervisor','sindico','subsindico',
                         'conselho','morador','campo')
                    NOT NULL DEFAULT 'morador',

  -- Dados específicos de morador
  unidade           VARCHAR(30)   NULL COMMENT 'Número do lote/unidade',
  doc_frente_key    TEXT          NULL COMMENT 'Chave storage — frente RG/CNH',
  doc_verso_key     TEXT          NULL COMMENT 'Chave storage — verso RG/CNH',
  doc_url_frente    TEXT          NULL,
  doc_url_verso     TEXT          NULL,

  -- Status e aprovação
  status            ENUM('pendente','aprovado','rejeitado','suspenso')
                    NOT NULL DEFAULT 'aprovado',
  aprovado_por      CHAR(36)      NULL,
  aprovado_em       DATETIME      NULL,
  motivo_rejeicao   TEXT          NULL,

  -- 2FA
  twofa_habilitado  TINYINT(1)    NOT NULL DEFAULT 0,
  otp_code          VARCHAR(6)    NULL,
  otp_expires_em    DATETIME      NULL,
  otp_tentativas    TINYINT       NOT NULL DEFAULT 0,

  -- Brute force
  tentativas_login  TINYINT       NOT NULL DEFAULT 0,
  bloqueado_ate     DATETIME      NULL,

  -- Controle
  ativo             TINYINT(1)    NOT NULL DEFAULT 1,
  criado_em         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ultimo_login      DATETIME      NULL,
  ultimo_ip         VARCHAR(45)   NULL,

  PRIMARY KEY (id),
  INDEX idx_login  (login),
  INDEX idx_email  (email),
  INDEX idx_perfil (perfil),
  INDEX idx_status (status),
  CONSTRAINT fk_aprovado_por FOREIGN KEY (aprovado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── SESSÕES (refresh tokens) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS sessoes (
  id           CHAR(36)    NOT NULL DEFAULT (UUID()),
  usuario_id   CHAR(36)    NOT NULL,
  refresh_hash TEXT        NOT NULL COMMENT 'bcrypt do refresh token',
  ip           VARCHAR(45) NULL,
  user_agent   TEXT        NULL,
  criado_em    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expira_em    DATETIME    NOT NULL,
  revogado     TINYINT(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX idx_sess_usuario (usuario_id),
  INDEX idx_sess_expira  (expira_em),
  CONSTRAINT fk_sessao_usuario FOREIGN KEY (usuario_id)
    REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── AUDIT LOG ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           CHAR(36)     NOT NULL DEFAULT (UUID()),
  usuario_id   CHAR(36)     NULL,
  usuario_nome VARCHAR(120) NULL COMMENT 'snapshot — preserva após exclusão',
  acao         VARCHAR(80)  NOT NULL,
  recurso      VARCHAR(80)  NULL COMMENT 'ex: tarefa, usuario, comprovacao',
  recurso_id   VARCHAR(36)  NULL,
  detalhe      JSON         NULL,
  ip           VARCHAR(45)  NULL,
  user_agent   TEXT         NULL,
  resultado    ENUM('sucesso','falha','bloqueado') NOT NULL DEFAULT 'sucesso',
  criado_em    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_audit_usuario  (usuario_id),
  INDEX idx_audit_acao     (acao),
  INDEX idx_audit_ts       (criado_em),
  INDEX idx_audit_resultado(resultado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── CICLO 8 DIAS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ciclo_8dias (
  id        INT          NOT NULL AUTO_INCREMENT,
  dia_ciclo TINYINT      NOT NULL,
  setor     VARCHAR(20)  NOT NULL,
  trecho    VARCHAR(120) NULL,
  limpeza   TEXT         NULL,
  rocagem   TEXT         NULL,
  inspecao  TEXT         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dia (dia_ciclo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── TAREFAS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tarefas (
  id            CHAR(36)    NOT NULL DEFAULT (UUID()),
  ciclo         ENUM('diario','semanal','mensal','anual') NOT NULL,
  setor         VARCHAR(60) NOT NULL,
  area          VARCHAR(120) NULL,
  atividade     TEXT        NOT NULL,
  equipe        VARCHAR(100) NULL,
  prioridade    ENUM('Alta','Média','Baixa','') NOT NULL DEFAULT '',
  status        ENUM('Pendente','Em Andamento','Concluído','Em Revisão')
                NOT NULL DEFAULT 'Pendente',
  observacoes   TEXT        NULL,
  criado_em     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  atualizado_por CHAR(36)   NULL,
  PRIMARY KEY (id),
  INDEX idx_ciclo     (ciclo),
  INDEX idx_setor     (setor),
  INDEX idx_status    (status),
  INDEX idx_prioridade(prioridade),
  CONSTRAINT fk_tarefa_usuario FOREIGN KEY (atualizado_por)
    REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── HISTÓRICO DE TAREFAS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS historico_tarefas (
  id           CHAR(36)    NOT NULL DEFAULT (UUID()),
  tarefa_id    CHAR(36)    NOT NULL,
  usuario_id   CHAR(36)    NULL,
  campo        VARCHAR(50) NULL,
  valor_antes  TEXT        NULL,
  valor_depois TEXT        NULL,
  acao         VARCHAR(30) NOT NULL,
  criado_em    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_hist_tarefa (tarefa_id),
  INDEX idx_hist_ts     (criado_em),
  CONSTRAINT fk_hist_tarefa  FOREIGN KEY (tarefa_id)  REFERENCES tarefas(id)  ON DELETE CASCADE,
  CONSTRAINT fk_hist_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── COMPROVAÇÕES FOTOGRÁFICAS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS comprovacoes (
  id               CHAR(36)     NOT NULL DEFAULT (UUID()),
  tarefa_id        CHAR(36)     NOT NULL,
  usuario_id       CHAR(36)     NULL,
  storage_driver   VARCHAR(10)  NOT NULL DEFAULT 'local',
  storage_key      TEXT         NOT NULL,
  url_publica      TEXT         NULL,
  filename_orig    VARCHAR(255) NULL,
  mime_type        VARCHAR(80)  NULL,
  tamanho_bytes    INT          NULL,
  enviado_em       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  enviado_por_nome VARCHAR(120) NULL,
  observacao       TEXT         NULL,
  PRIMARY KEY (id),
  INDEX idx_comp_tarefa  (tarefa_id),
  INDEX idx_comp_usuario (usuario_id),
  INDEX idx_comp_ts      (enviado_em),
  CONSTRAINT fk_comp_tarefa  FOREIGN KEY (tarefa_id)  REFERENCES tarefas(id)  ON DELETE CASCADE,
  CONSTRAINT fk_comp_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── OBSERVAÇÕES DE MORADORES ──────────────────────────────────
CREATE TABLE IF NOT EXISTS observacoes_moradores (
  id          CHAR(36)    NOT NULL DEFAULT (UUID()),
  tarefa_id   CHAR(36)    NULL,
  usuario_id  CHAR(36)    NULL,
  setor       VARCHAR(60) NULL,
  mensagem    TEXT        NOT NULL,
  lida        TINYINT(1)  NOT NULL DEFAULT 0,
  criado_em   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_obs_tarefa  (tarefa_id),
  INDEX idx_obs_usuario (usuario_id),
  CONSTRAINT fk_obs_tarefa  FOREIGN KEY (tarefa_id)  REFERENCES tarefas(id)  ON DELETE CASCADE,
  CONSTRAINT fk_obs_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ══════════════════════════════════════════════════════════════
--  SEED: CICLO 8 DIAS
-- ══════════════════════════════════════════════════════════════
-- @seed:start
INSERT IGNORE INTO ciclo_8dias (dia_ciclo,setor,trecho,limpeza,rocagem,inspecao) VALUES
(1,'S1','Entrada → Rua A','Limpeza de ruas/guia/meio-fio + coleta de resíduos','Roçagem (meio-fio + 1,5m dentro dos lotes)','Checagem drenagem/ralos/grelhas'),
(2,'S2','Rua A → Rua C','Limpeza de ruas/guia/meio-fio + coleta de resíduos','Roçagem (meio-fio + 1,5m dentro dos lotes)','Checagem drenagem/ralos/grelhas'),
(3,'S3','Rua C → Lago 1','Limpeza de ruas/guia/meio-fio + coleta de resíduos','Roçagem (meio-fio + 1,5m dentro dos lotes)','Checagem drenagem/ralos/grelhas'),
(4,'S4','Lago 1 → Lago 2','Limpeza de ruas/guia/meio-fio + coleta de resíduos','Roçagem (meio-fio + 1,5m dentro dos lotes)','Checagem drenagem/ralos/grelhas'),
(5,'S5','Lago 2 → Est. Esgoto','Limpeza de ruas/guia/meio-fio + coleta de resíduos','Roçagem (meio-fio + 1,5m dentro dos lotes)','Checagem drenagem/ralos/grelhas'),
(6,'S6','Est. 1 → Quadras','Limpeza de ruas/guia/meio-fio + coleta de resíduos','Roçagem (meio-fio + 1,5m dentro dos lotes)','Checagem drenagem/ralos/grelhas'),
(7,'S7','Quadras → Área Lazer','Limpeza de ruas/guia/meio-fio + coleta de resíduos','Roçagem (meio-fio + 1,5m dentro dos lotes)','Checagem drenagem/ralos/grelhas'),
(8,'S8','Área Lazer → Praia','Limpeza de ruas/guia/meio-fio + coleta de resíduos','Roçagem (meio-fio + 1,5m dentro dos lotes)','Checagem drenagem/ralos/grelhas');

-- ══════════════════════════════════════════════════════════════
--  SEED: TAREFAS
-- ══════════════════════════════════════════════════════════════
INSERT INTO tarefas (ciclo,setor,area,atividade,equipe,prioridade) VALUES
('diario','Esgoto','Estações','Ronda/inspeção visual das estações de esgoto','Manutenção','Alta'),
('diario','Geral','','Coleta e organização de resíduos','Equipe Limpeza','Alta'),
('diario','Geral','Áreas comuns','Limpeza diária das áreas comuns','Equipe Limpeza','Alta'),
('diario','Geral','','Limpeza da academia (2x ao dia)','Equipe Limpeza','Média'),
('diario','Geral','','Limpeza áreas de lazer','Equipe Limpeza','Média'),
('diario','Hidráulica','','Verificação de vazamentos aparentes','Manutenção','Média'),
('diario','Jardinagem','Áreas verdes','Limpeza de folhas e resíduos vegetais','Equipe Jardinagem','Média'),
('diario','Jardinagem','Áreas verdes','Manutenção do sistema de irrigação','Equipe Jardinagem','Alta'),
('diario','Lagos','Lagos (3)','Inspeção visual + remoção de resíduos','Manutenção/Jardinagem','Média'),
('diario','Piscinas','Piscinas','Aplicação de produtos Cl/Ph (diário)','Equipe Piscinas','Alta'),
('diario','Piscinas','Piscinas','Limpeza de decks (diário)','Equipe Limpeza','Média'),
('diario','Piscinas','Piscinas','Limpeza de mobiliário (diário)','Equipe Limpeza','Média'),
('diario','S1','','Limpeza de ruas (Entrada → Rua A)','Equipe Limpeza',''),
('diario','S2','','Limpeza de ruas (Rua A → Rua C)','Equipe Limpeza',''),
('diario','S3','','Roçagem meio-fio (Rua C → Lago 1)','Equipe Jardinagem',''),
('diario','S4','','Limpeza de ruas (Lago 1 → Lago 2)','Equipe Limpeza',''),
('semanal','Elétrica','Áreas comuns','Troca de lâmpadas e luminárias','Manutenção','Média'),
('semanal','Hidráulica','Club','Verificação do sistema de filtros','Manutenção','Média'),
('semanal','Hidráulica','Drenagem','Limpeza de caixas de gordura coletivas','Manutenção','Média'),
('semanal','Portões','','Lubrificação de trilhos e dobradiças','Manutenção','Média'),
('semanal','Segurança','CFTV','Limpeza de lentes + teste de gravação','TI/Segurança','Média'),
('semanal','Áreas de Lazer','Playground','Inspeção de brinquedos + fixações','Manutenção','Alta'),
('mensal','Elétrica','Quadros','Revisão de quadros elétricos (prestador)','Prestador','Alta'),
('mensal','Hidráulica','','Verificação de bombas (rodízio)','Manutenção','Alta'),
('mensal','Piscinas','','Monitoramento químico completo','Equipe Piscinas','Alta'),
('mensal','Portões/Acessos','Automatizadores','Ajuste de motores e automatizadores','Manutenção','Alta'),
('mensal','Seg. Incêndio','Iluminação','Teste de iluminação de emergência','Manutenção','Alta'),
('mensal','Seg. Incêndio','Rotas','Verificação de sinalização de incêndio','Manutenção','Alta'),
('anual','Esgoto','','Limpeza das estações elevatórias','Prestador','Alta'),
('anual','Estrutural','','Inspeção estrutural preventiva','Engenharia/Prestador','Alta'),
('anual','Geral','','Dedetização e desratização','Prestador','Média'),
('anual','Hidráulica','','Limpeza de caixas d''água','Prestador','Alta'),
('anual','Incêndio','','Recarga de extintores','Prestador','Alta'),
('anual','Piscinas','','Troca do elemento filtrante','Prestador','Alta');
-- @seed:end

-- Usuários criados via script (bcrypt)
