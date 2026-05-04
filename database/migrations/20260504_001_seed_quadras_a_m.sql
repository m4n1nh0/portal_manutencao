-- Organiza o seed de ruas por quadras, de A ate M.

-- @seed:start
INSERT INTO ciclo_8dias (dia_ciclo,setor,trecho,limpeza,rocagem,inspecao) VALUES
(1,'Quadras A-B','Quadras A e B','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(2,'Quadras C-D','Quadras C e D','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(3,'Quadras E-F','Quadras E e F','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(4,'Quadras G-H','Quadras G e H','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(5,'Quadras I-J','Quadras I e J','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(6,'Quadra K','Quadra K','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(7,'Quadra L','Quadra L','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(8,'Quadra M','Quadra M','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas')
ON DUPLICATE KEY UPDATE
  setor = VALUES(setor),
  trecho = VALUES(trecho),
  limpeza = VALUES(limpeza),
  rocagem = VALUES(rocagem),
  inspecao = VALUES(inspecao);

DELETE FROM tarefas
WHERE ciclo = 'diario'
  AND setor REGEXP '^S[0-9]+$';

INSERT INTO tarefas (ciclo,setor,area,atividade,equipe,prioridade)
SELECT *
FROM (
  SELECT 'diario' ciclo,'Quadra A' setor,'Ruas internas' area,'Limpeza de ruas, guias e meio-fio - Quadra A' atividade,'Equipe Limpeza' equipe,'' prioridade
  UNION ALL SELECT 'diario','Quadra B','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra B','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra C','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra C','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra D','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra D','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra E','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra E','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra F','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra F','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra G','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra G','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra H','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra H','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra I','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra I','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra J','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra J','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra K','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra K','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra L','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra L','Equipe Limpeza',''
  UNION ALL SELECT 'diario','Quadra M','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra M','Equipe Limpeza',''
) AS quadras
WHERE NOT EXISTS (
  SELECT 1 FROM tarefas t
  WHERE t.ciclo = quadras.ciclo
    AND t.setor = quadras.setor
    AND t.atividade = quadras.atividade
);
-- @seed:end
