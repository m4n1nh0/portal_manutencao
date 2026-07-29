-- Development seed: operational reference data.
-- Executed by backend/scripts/seed.js only when seed execution is explicitly allowed.
-- Multi-tenant: todo o conteudo pertence ao condominio de demonstracao.

SET @cond := (SELECT id FROM condominios WHERE slug = 'principal');

INSERT INTO ciclo_8dias (condominio_id,dia_ciclo,setor,trecho,limpeza,rocagem,inspecao) VALUES
(@cond,1,'Quadras A-B','Quadras A e B','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(@cond,2,'Quadras C-D','Quadras C e D','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(@cond,3,'Quadras E-F','Quadras E e F','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(@cond,4,'Quadras G-H','Quadras G e H','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(@cond,5,'Quadras I-J','Quadras I e J','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(@cond,6,'Quadra K','Quadra K','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(@cond,7,'Quadra L','Quadra L','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas'),
(@cond,8,'Quadra M','Quadra M','Limpeza de ruas, guias e meio-fio','Rocagem no meio-fio e faixa interna dos lotes','Checagem de drenagem, ralos e grelhas')
ON DUPLICATE KEY UPDATE
  setor = VALUES(setor),
  trecho = VALUES(trecho),
  limpeza = VALUES(limpeza),
  rocagem = VALUES(rocagem),
  inspecao = VALUES(inspecao);

INSERT INTO ciclo_atividades (id,condominio_id,ciclo_id,ordem,titulo,descricao,equipe,prioridade,ativo)
SELECT UUID(), @cond, c.id, seed.ordem, seed.titulo, seed.descricao, seed.equipe, '', 1
FROM ciclo_8dias c
JOIN (
  SELECT dia_ciclo, 1 ordem, 'Limpeza' titulo, limpeza descricao, 'Equipe Limpeza' equipe FROM ciclo_8dias WHERE condominio_id = @cond
  UNION ALL
  SELECT dia_ciclo, 2, 'Rocagem', rocagem, 'Equipe Jardinagem' FROM ciclo_8dias WHERE condominio_id = @cond
  UNION ALL
  SELECT dia_ciclo, 3, 'Inspecao', inspecao, 'Manutencao' FROM ciclo_8dias WHERE condominio_id = @cond
) seed ON seed.dia_ciclo = c.dia_ciclo
WHERE c.condominio_id = @cond
  AND seed.descricao IS NOT NULL AND TRIM(seed.descricao) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM ciclo_atividades a
    WHERE a.ciclo_id = c.id AND a.titulo = seed.titulo
  );

INSERT INTO quadras (condominio_id,codigo,nome) VALUES
(@cond,'A','Quadra A'),(@cond,'B','Quadra B'),(@cond,'C','Quadra C'),(@cond,'D','Quadra D'),
(@cond,'E','Quadra E'),(@cond,'F','Quadra F'),(@cond,'G','Quadra G'),(@cond,'H','Quadra H'),
(@cond,'I','Quadra I'),(@cond,'J','Quadra J'),(@cond,'K','Quadra K'),(@cond,'L','Quadra L'),(@cond,'M','Quadra M')
ON DUPLICATE KEY UPDATE nome = VALUES(nome), ativo = 1;

INSERT INTO ruas (condominio_id,quadra_id,nome,ordem)
SELECT @cond, q.id, seed.nome, seed.ordem
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
WHERE q.condominio_id = @cond
  AND NOT EXISTS (
    SELECT 1 FROM ruas r WHERE r.quadra_id = q.id AND r.nome = seed.nome
  );

INSERT INTO equipes (condominio_id,nome,tipo) VALUES
(@cond,'Equipe Limpeza','Operacional'),
(@cond,'Equipe Jardinagem','Operacional'),
(@cond,'Manutencao','Operacional'),
(@cond,'Equipe Piscinas','Operacional'),
(@cond,'TI/Seguranca','Apoio'),
(@cond,'Prestador','Terceiro')
ON DUPLICATE KEY UPDATE tipo = VALUES(tipo), ativo = 1;

INSERT INTO locais (condominio_id,nome,categoria) VALUES
(@cond,'Ruas internas','Ruas'),
(@cond,'Areas comuns','Geral'),
(@cond,'Academia','Lazer'),
(@cond,'Areas de lazer','Lazer'),
(@cond,'Areas verdes','Jardinagem'),
(@cond,'Lagos','Lazer'),
(@cond,'Piscinas','Lazer'),
(@cond,'Estacoes de esgoto','Esgoto'),
(@cond,'Hidraulica','Infraestrutura'),
(@cond,'Drenagem','Infraestrutura'),
(@cond,'Quadros eletricos','Eletrica'),
(@cond,'Portoes','Acessos'),
(@cond,'CFTV','Seguranca'),
(@cond,'Playground','Lazer')
ON DUPLICATE KEY UPDATE categoria = VALUES(categoria), ativo = 1;
