-- Development seed: operational reference data.
-- Executed by backend/scripts/seed.js only when seed execution is explicitly allowed.

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

INSERT INTO ciclo_atividades (id,ciclo_id,ordem,titulo,descricao,equipe,prioridade,ativo)
SELECT UUID(), c.id, seed.ordem, seed.titulo, seed.descricao, seed.equipe, '', 1
FROM ciclo_8dias c
JOIN (
  SELECT dia_ciclo, 1 ordem, 'Limpeza' titulo, limpeza descricao, 'Equipe Limpeza' equipe FROM ciclo_8dias
  UNION ALL
  SELECT dia_ciclo, 2, 'Rocagem', rocagem, 'Equipe Jardinagem' FROM ciclo_8dias
  UNION ALL
  SELECT dia_ciclo, 3, 'Inspecao', inspecao, 'Manutencao' FROM ciclo_8dias
) seed ON seed.dia_ciclo = c.dia_ciclo
WHERE seed.descricao IS NOT NULL AND TRIM(seed.descricao) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM ciclo_atividades a
    WHERE a.ciclo_id = c.id AND a.titulo = seed.titulo
  );

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
