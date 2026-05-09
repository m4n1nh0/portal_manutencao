-- Ciclo com atividades vinculadas, sem depender de campos fixos por tipo.

CREATE TABLE IF NOT EXISTS ciclo_atividades (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  ciclo_id      INT          NOT NULL,
  ordem         SMALLINT     NOT NULL DEFAULT 1,
  titulo        VARCHAR(80)  NOT NULL,
  descricao     TEXT         NOT NULL,
  equipe        VARCHAR(100) NULL,
  prioridade    VARCHAR(20)  NOT NULL DEFAULT '',
  ativo         TINYINT(1)   NOT NULL DEFAULT 1,
  criado_em     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ciclo_atividades_ciclo (ciclo_id,ativo,ordem),
  CONSTRAINT fk_ciclo_atividades_ciclo
    FOREIGN KEY (ciclo_id) REFERENCES ciclo_8dias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO ciclo_atividades (id,ciclo_id,ordem,titulo,descricao,equipe,prioridade,ativo)
SELECT UUID(), c.id, 1, 'Limpeza', c.limpeza, 'Equipe Limpeza', '', 1
FROM ciclo_8dias c
WHERE c.limpeza IS NOT NULL AND TRIM(c.limpeza) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM ciclo_atividades a
    WHERE a.ciclo_id = c.id AND a.titulo = 'Limpeza'
  );

INSERT INTO ciclo_atividades (id,ciclo_id,ordem,titulo,descricao,equipe,prioridade,ativo)
SELECT UUID(), c.id, 2, 'Rocagem', c.rocagem, 'Equipe Jardinagem', '', 1
FROM ciclo_8dias c
WHERE c.rocagem IS NOT NULL AND TRIM(c.rocagem) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM ciclo_atividades a
    WHERE a.ciclo_id = c.id AND a.titulo = 'Rocagem'
  );

INSERT INTO ciclo_atividades (id,ciclo_id,ordem,titulo,descricao,equipe,prioridade,ativo)
SELECT UUID(), c.id, 3, 'Inspecao', c.inspecao, 'Manutencao', '', 1
FROM ciclo_8dias c
WHERE c.inspecao IS NOT NULL AND TRIM(c.inspecao) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM ciclo_atividades a
    WHERE a.ciclo_id = c.id AND a.titulo = 'Inspecao'
  );
