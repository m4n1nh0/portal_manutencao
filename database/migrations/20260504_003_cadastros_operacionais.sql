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

-- @seed:start
INSERT INTO equipes (nome,tipo) VALUES
('Equipe Limpeza','Operacional'),
('Equipe Jardinagem','Operacional'),
('Manutencao','Operacional'),
('Equipe Piscinas','Operacional'),
('TI/Seguranca','Apoio'),
('Prestador','Terceiro')
ON DUPLICATE KEY UPDATE tipo = VALUES(tipo), ativo = 1;

INSERT INTO locais (nome,categoria) VALUES
('Ruas internas','Ruas'),
('Areas comuns','Geral'),
('Academia','Lazer'),
('Areas de lazer','Lazer'),
('Areas verdes','Jardinagem'),
('Lagos','Lazer'),
('Piscinas','Lazer'),
('Estacoes de esgoto','Esgoto'),
('Hidraulica','Infraestrutura'),
('Drenagem','Infraestrutura'),
('Quadros eletricos','Eletrica'),
('Portoes','Acessos'),
('CFTV','Seguranca'),
('Playground','Lazer')
ON DUPLICATE KEY UPDATE categoria = VALUES(categoria), ativo = 1;

INSERT INTO tarefa_modelos (ciclo,setor,area,atividade,equipe,prioridade)
SELECT DISTINCT t.ciclo,t.setor,t.area,t.atividade,t.equipe,
  CASE WHEN t.prioridade = 'Média' THEN 'Media' ELSE t.prioridade END AS prioridade
FROM tarefas t
WHERE NOT EXISTS (
  SELECT 1 FROM tarefa_modelos m
  WHERE m.ciclo = t.ciclo
    AND m.setor = t.setor
    AND COALESCE(m.area,'') = COALESCE(t.area,'')
    AND m.atividade = t.atividade
);
-- @seed:end
