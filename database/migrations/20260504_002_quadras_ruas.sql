-- Cadastro de quadras e ruas.

CREATE TABLE IF NOT EXISTS quadras (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  codigo        VARCHAR(3)   NOT NULL,
  nome          VARCHAR(80)  NOT NULL,
  descricao     VARCHAR(255) NULL,
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_quadras_codigo (codigo),
  INDEX idx_quadras_ativo (ativo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ruas (
  id            CHAR(36)    NOT NULL DEFAULT (UUID()),
  quadra_id     CHAR(36)    NOT NULL,
  nome          VARCHAR(80) NOT NULL,
  ordem         TINYINT     NOT NULL DEFAULT 1,
  ativo         TINYINT(1)  NOT NULL DEFAULT 1,
  criado_em     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ruas_quadra_nome (quadra_id,nome),
  UNIQUE KEY uq_ruas_quadra_ordem (quadra_id,ordem),
  INDEX idx_ruas_quadra (quadra_id),
  CONSTRAINT fk_rua_quadra FOREIGN KEY (quadra_id)
    REFERENCES quadras(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed data for quadras and ruas lives in database/seeds/001_operational_base.sql.
