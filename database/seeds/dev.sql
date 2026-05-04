-- Development-only seed data. This file is executed by backend/scripts/seed.js.

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
SELECT seed.ciclo,seed.setor,seed.area,seed.atividade,seed.equipe,seed.prioridade
FROM (
  SELECT 'diario' ciclo,'Esgoto' setor,'Estações' area,'Ronda/inspeção visual das estações de esgoto' atividade,'Manutenção' equipe,'Alta' prioridade
  UNION ALL SELECT 'diario','Geral','','Coleta e organização de resíduos','Equipe Limpeza','Alta'
  UNION ALL SELECT 'diario','Geral','Áreas comuns','Limpeza diária das áreas comuns','Equipe Limpeza','Alta'
  UNION ALL SELECT 'diario','Geral','','Limpeza da academia (2x ao dia)','Equipe Limpeza','Média'
  UNION ALL SELECT 'diario','Geral','','Limpeza áreas de lazer','Equipe Limpeza','Média'
  UNION ALL SELECT 'diario','Hidráulica','','Verificação de vazamentos aparentes','Manutenção','Média'
  UNION ALL SELECT 'diario','Jardinagem','Áreas verdes','Limpeza de folhas e resíduos vegetais','Equipe Jardinagem','Média'
  UNION ALL SELECT 'diario','Jardinagem','Áreas verdes','Manutenção do sistema de irrigação','Equipe Jardinagem','Alta'
  UNION ALL SELECT 'diario','Lagos','Lagos (3)','Inspeção visual + remoção de resíduos','Manutenção/Jardinagem','Média'
  UNION ALL SELECT 'diario','Piscinas','Piscinas','Aplicação de produtos Cl/Ph (diário)','Equipe Piscinas','Alta'
  UNION ALL SELECT 'diario','Piscinas','Piscinas','Limpeza de decks (diário)','Equipe Limpeza','Média'
  UNION ALL SELECT 'diario','Piscinas','Piscinas','Limpeza de mobiliário (diário)','Equipe Limpeza','Média'
  UNION ALL SELECT 'diario','Quadra A','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra A','Equipe Limpeza',''
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
  UNION ALL SELECT 'semanal','Elétrica','Áreas comuns','Troca de lâmpadas e luminárias','Manutenção','Média'
  UNION ALL SELECT 'semanal','Hidráulica','Club','Verificação do sistema de filtros','Manutenção','Média'
  UNION ALL SELECT 'semanal','Hidráulica','Drenagem','Limpeza de caixas de gordura coletivas','Manutenção','Média'
  UNION ALL SELECT 'semanal','Portões','','Lubrificação de trilhos e dobradiças','Manutenção','Média'
  UNION ALL SELECT 'semanal','Segurança','CFTV','Limpeza de lentes + teste de gravação','TI/Segurança','Média'
  UNION ALL SELECT 'semanal','Áreas de Lazer','Playground','Inspeção de brinquedos + fixações','Manutenção','Alta'
  UNION ALL SELECT 'mensal','Elétrica','Quadros','Revisão de quadros elétricos (prestador)','Prestador','Alta'
  UNION ALL SELECT 'mensal','Hidráulica','','Verificação de bombas (rodízio)','Manutenção','Alta'
  UNION ALL SELECT 'mensal','Piscinas','','Monitoramento químico completo','Equipe Piscinas','Alta'
  UNION ALL SELECT 'mensal','Portões/Acessos','Automatizadores','Ajuste de motores e automatizadores','Manutenção','Alta'
  UNION ALL SELECT 'mensal','Seg. Incêndio','Iluminação','Teste de iluminação de emergência','Manutenção','Alta'
  UNION ALL SELECT 'mensal','Seg. Incêndio','Rotas','Verificação de sinalização de incêndio','Manutenção','Alta'
  UNION ALL SELECT 'anual','Esgoto','','Limpeza das estações elevatórias','Prestador','Alta'
  UNION ALL SELECT 'anual','Estrutural','','Inspeção estrutural preventiva','Engenharia/Prestador','Alta'
  UNION ALL SELECT 'anual','Geral','','Dedetização e desratização','Prestador','Média'
  UNION ALL SELECT 'anual','Hidráulica','','Limpeza de caixas d''água','Prestador','Alta'
  UNION ALL SELECT 'anual','Incêndio','','Recarga de extintores','Prestador','Alta'
  UNION ALL SELECT 'anual','Piscinas','','Troca do elemento filtrante','Prestador','Alta'
) seed
WHERE NOT EXISTS (
  SELECT 1 FROM tarefas t
  WHERE t.ciclo = seed.ciclo
    AND t.setor = seed.setor
    AND COALESCE(t.area,'') = COALESCE(seed.area,'')
    AND t.atividade = seed.atividade
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
