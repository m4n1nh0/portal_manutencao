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

-- @seed:start
INSERT INTO quadras (codigo,nome) VALUES
('A','Quadra A'),('B','Quadra B'),('C','Quadra C'),('D','Quadra D'),
('E','Quadra E'),('F','Quadra F'),('G','Quadra G'),('H','Quadra H'),
('I','Quadra I'),('J','Quadra J'),('K','Quadra K'),('L','Quadra L'),('M','Quadra M')
ON DUPLICATE KEY UPDATE nome = VALUES(nome), ativo = 1;

INSERT INTO ruas (quadra_id,nome,ordem)
SELECT q.id, seed.nome, seed.ordem
FROM quadras q
JOIN (
  SELECT 'A' codigo,'Rua 1' nome,1 ordem UNION ALL
  SELECT 'B','Rua 1',1 UNION ALL
  SELECT 'C','Rua 1',1 UNION ALL SELECT 'C','Rua 2',2 UNION ALL SELECT 'C','Rua 3',3 UNION ALL SELECT 'C','Rua 4',4 UNION ALL
  SELECT 'D','Rua 1',1 UNION ALL SELECT 'D','Rua 2',2 UNION ALL SELECT 'D','Rua 3',3 UNION ALL SELECT 'D','Rua 4',4 UNION ALL
  SELECT 'E','Rua 1',1 UNION ALL
  SELECT 'F','Rua 1',1 UNION ALL
  SELECT 'G','Rua 1',1 UNION ALL SELECT 'G','Rua 2',2 UNION ALL SELECT 'G','Rua 3',3 UNION ALL SELECT 'G','Rua 4',4 UNION ALL
  SELECT 'H','Rua 1',1 UNION ALL
  SELECT 'I','Rua 1',1 UNION ALL
  SELECT 'J','Rua 1',1 UNION ALL SELECT 'J','Rua 2',2 UNION ALL SELECT 'J','Rua 3',3 UNION ALL SELECT 'J','Rua 4',4 UNION ALL
  SELECT 'K','Rua 1',1 UNION ALL
  SELECT 'L','Rua 1',1 UNION ALL
  SELECT 'M','Rua 1',1
) seed ON seed.codigo = q.codigo
WHERE NOT EXISTS (
  SELECT 1 FROM ruas r WHERE r.quadra_id = q.id AND r.nome = seed.nome
);
-- @seed:end
