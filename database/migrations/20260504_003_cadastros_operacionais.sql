-- Cadastros operacionais: ciclo editavel, responsaveis, areas/locais e modelos de tarefas.

CREATE TABLE IF NOT EXISTS equipes (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  nome          VARCHAR(100) NOT NULL,
  tipo          VARCHAR(40)  NULL,
  contato       VARCHAR(120) NULL,
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_equipes_nome (nome),
  INDEX idx_equipes_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS locais (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  nome          VARCHAR(120) NOT NULL,
  categoria     VARCHAR(60)  NULL,
  descricao     VARCHAR(255) NULL,
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_locais_nome (nome),
  INDEX idx_locais_categoria (categoria),
  INDEX idx_locais_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tarefa_modelos (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  ciclo         ENUM('diario','semanal','mensal','anual') NOT NULL,
  setor         VARCHAR(60)  NOT NULL,
  area          VARCHAR(120) NULL,
  atividade     TEXT         NOT NULL,
  equipe        VARCHAR(100) NULL,
  prioridade    VARCHAR(20)  NOT NULL DEFAULT '',
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_modelo_tarefa (ciclo,setor,area,atividade(160)),
  INDEX idx_modelo_ciclo (ciclo),
  INDEX idx_modelo_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed data for operational records and task models lives in database/seeds/*.sql.
