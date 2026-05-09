-- Development seed: task portfolio with visible progress for demo and QA.

DELETE FROM tarefas
WHERE ciclo = 'diario'
  AND setor REGEXP '^S[0-9]+$'
  AND (observacoes IS NULL OR observacoes = '' OR observacoes LIKE 'Demo:%');

CREATE TEMPORARY TABLE seed_tarefas_demo (
  ciclo VARCHAR(20) NOT NULL,
  setor VARCHAR(60) NOT NULL,
  area VARCHAR(120) NULL,
  atividade TEXT NOT NULL,
  equipe VARCHAR(100) NULL,
  prioridade VARCHAR(20) NOT NULL DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'Pendente',
  observacoes TEXT NULL,
  atualizado_em DATETIME NOT NULL
) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO seed_tarefas_demo
  (ciclo,setor,area,atividade,equipe,prioridade,status,observacoes,atualizado_em)
VALUES
('diario','Esgoto','Estações','Ronda/inspeção visual das estações de esgoto','Manutenção','Alta','Concluído','Demo: ronda concluída sem alarme nas elevatórias.',DATE_SUB(NOW(), INTERVAL 4 HOUR)),
('diario','Geral','','Coleta e organização de resíduos','Equipe Limpeza','Alta','Concluído','Demo: coleta finalizada antes do horário de pico.',DATE_SUB(NOW(), INTERVAL 3 HOUR)),
('diario','Geral','Áreas comuns','Limpeza diária das áreas comuns','Equipe Limpeza','Alta','Em Andamento','Demo: bloco social em execução, salão já liberado.',DATE_SUB(NOW(), INTERVAL 70 MINUTE)),
('diario','Geral','','Limpeza da academia (2x ao dia)','Equipe Limpeza','Média','Pendente','Demo: segunda passagem programada para o fim da tarde.',DATE_SUB(NOW(), INTERVAL 40 MINUTE)),
('diario','Geral','','Limpeza áreas de lazer','Equipe Limpeza','Média','Pendente','Demo: aguardando redução de fluxo no espaço gourmet.',DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
('diario','Hidráulica','','Verificação de vazamentos aparentes','Manutenção','Média','Em Revisão','Demo: ponto de umidade na casa de bombas em validação.',DATE_SUB(NOW(), INTERVAL 55 MINUTE)),
('diario','Jardinagem','Áreas verdes','Limpeza de folhas e resíduos vegetais','Equipe Jardinagem','Média','Concluído','Demo: frente do clube e praça principal concluídas.',DATE_SUB(NOW(), INTERVAL 2 HOUR)),
('diario','Jardinagem','Áreas verdes','Manutenção do sistema de irrigação','Equipe Jardinagem','Alta','Em Andamento','Demo: setor G em ajuste de aspersores.',DATE_SUB(NOW(), INTERVAL 80 MINUTE)),
('diario','Lagos','Lagos (3)','Inspeção visual + remoção de resíduos','Manutenção/Jardinagem','Média','Pendente','Demo: equipe agenda vistoria após limpeza das ruas.',DATE_SUB(NOW(), INTERVAL 35 MINUTE)),
('diario','Piscinas','Piscinas','Aplicação de produtos Cl/Ph (diário)','Equipe Piscinas','Alta','Concluído','Demo: parâmetros dentro da faixa operacional.',DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
('diario','Piscinas','Piscinas','Limpeza de decks (diário)','Equipe Limpeza','Média','Em Andamento','Demo: deck infantil em andamento.',DATE_SUB(NOW(), INTERVAL 25 MINUTE)),
('diario','Piscinas','Piscinas','Limpeza de mobiliário (diário)','Equipe Limpeza','Média','Pendente','Demo: mobiliário reservado para última ronda.',DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
('diario','Quadra A','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra A','Equipe Limpeza','','Concluído','Demo: quadra limpa e revisada.',DATE_SUB(NOW(), INTERVAL 5 HOUR)),
('diario','Quadra B','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra B','Equipe Limpeza','','Concluído','Demo: quadra limpa e revisada.',DATE_SUB(NOW(), INTERVAL 5 HOUR)),
('diario','Quadra C','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra C','Equipe Limpeza','','Em Andamento','Demo: metade norte em execução.',DATE_SUB(NOW(), INTERVAL 65 MINUTE)),
('diario','Quadra D','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra D','Equipe Limpeza','','Pendente','Demo: próxima quadra da rota diária.',DATE_SUB(NOW(), INTERVAL 12 MINUTE)),
('diario','Quadra E','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra E','Equipe Limpeza','','Pendente','Demo: aguardando equipe finalizar Quadra D.',DATE_SUB(NOW(), INTERVAL 12 MINUTE)),
('diario','Quadra F','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra F','Equipe Limpeza','','Pendente','Demo: rota da tarde.',DATE_SUB(NOW(), INTERVAL 12 MINUTE)),
('diario','Quadra G','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra G','Equipe Limpeza','','Concluído','Demo: liberada após vistoria do supervisor.',DATE_SUB(NOW(), INTERVAL 6 HOUR)),
('diario','Quadra H','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra H','Equipe Limpeza','','Em Revisão','Demo: morador apontou resíduo próximo ao lote 18.',DATE_SUB(NOW(), INTERVAL 45 MINUTE)),
('diario','Quadra I','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra I','Equipe Limpeza','','Pendente','Demo: programação do final do dia.',DATE_SUB(NOW(), INTERVAL 12 MINUTE)),
('diario','Quadra J','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra J','Equipe Limpeza','','Pendente','Demo: programação do final do dia.',DATE_SUB(NOW(), INTERVAL 12 MINUTE)),
('diario','Quadra K','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra K','Equipe Limpeza','','Concluído','Demo: quadra concluída pela equipe extra.',DATE_SUB(NOW(), INTERVAL 7 HOUR)),
('diario','Quadra L','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra L','Equipe Limpeza','','Pendente','Demo: rota externa.',DATE_SUB(NOW(), INTERVAL 12 MINUTE)),
('diario','Quadra M','Ruas internas','Limpeza de ruas, guias e meio-fio - Quadra M','Equipe Limpeza','','Pendente','Demo: rota externa.',DATE_SUB(NOW(), INTERVAL 12 MINUTE)),
('semanal','Elétrica','Áreas comuns','Troca de lâmpadas e luminárias','Manutenção','Média','Concluído','Demo: 7 lâmpadas substituídas no clube e praça.',DATE_SUB(NOW(), INTERVAL 1 DAY)),
('semanal','Hidráulica','Club','Verificação do sistema de filtros','Manutenção','Média','Em Andamento','Demo: filtro principal aberto para limpeza preventiva.',DATE_SUB(NOW(), INTERVAL 5 HOUR)),
('semanal','Hidráulica','Drenagem','Limpeza de caixas de gordura coletivas','Manutenção','Média','Pendente','Demo: ação semanal agendada para quinta-feira.',DATE_SUB(NOW(), INTERVAL 2 HOUR)),
('semanal','Portões','','Lubrificação de trilhos e dobradiças','Manutenção','Média','Concluído','Demo: portões de serviço e social lubrificados.',DATE_SUB(NOW(), INTERVAL 2 DAY)),
('semanal','Segurança','CFTV','Limpeza de lentes + teste de gravação','TI/Segurança','Média','Em Revisão','Demo: câmera C14 com imagem intermitente em análise.',DATE_SUB(NOW(), INTERVAL 3 HOUR)),
('semanal','Áreas de Lazer','Playground','Inspeção de brinquedos + fixações','Manutenção','Alta','Pendente','Demo: ação semanal crítica antes do fim de semana.',DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
('semanal','Jardinagem','Taludes','Poda leve e remoção de galhos baixos','Equipe Jardinagem','Média','Concluído','Demo: poda concluída nos taludes próximos à portaria.',DATE_SUB(NOW(), INTERVAL 2 DAY)),
('semanal','Piscinas','Casa de máquinas','Retrolavagem dos filtros das piscinas','Equipe Piscinas','Alta','Em Andamento','Demo: piscina adulto em execução, infantil concluída.',DATE_SUB(NOW(), INTERVAL 2 HOUR)),
('semanal','Resíduos','Lixeiras externas','Higienização completa das lixeiras externas','Equipe Limpeza','Baixa','Pendente','Demo: equipe executa após a coleta municipal.',DATE_SUB(NOW(), INTERVAL 1 HOUR)),
('semanal','Pavimentação','Ruas internas','Inspeção de buracos, grelhas e desníveis','Manutenção','Média','Pendente','Demo: checklist semanal aberto para vistoria.',DATE_SUB(NOW(), INTERVAL 1 HOUR)),
('mensal','Elétrica','Quadros','Revisão de quadros elétricos (prestador)','Prestador','Alta','Concluído','Demo: termografia sem pontos críticos.',DATE_SUB(NOW(), INTERVAL 5 DAY)),
('mensal','Hidráulica','','Verificação de bombas (rodízio)','Manutenção','Alta','Em Andamento','Demo: bomba reserva em teste de alternância.',DATE_SUB(NOW(), INTERVAL 1 DAY)),
('mensal','Piscinas','','Monitoramento químico completo','Equipe Piscinas','Alta','Concluído','Demo: laudo mensal anexado pela equipe.',DATE_SUB(NOW(), INTERVAL 4 DAY)),
('mensal','Portões/Acessos','Automatizadores','Ajuste de motores e automatizadores','Manutenção','Alta','Em Revisão','Demo: motor do acesso de serviço exige novo teste.',DATE_SUB(NOW(), INTERVAL 8 HOUR)),
('mensal','Seg. Incêndio','Iluminação','Teste de iluminação de emergência','Manutenção','Alta','Pendente','Demo: ação mensal programada para simulado.',DATE_SUB(NOW(), INTERVAL 3 HOUR)),
('mensal','Seg. Incêndio','Rotas','Verificação de sinalização de incêndio','Manutenção','Alta','Pendente','Demo: placas do bloco social em conferência.',DATE_SUB(NOW(), INTERVAL 3 HOUR)),
('mensal','Gerador','Casa de máquinas','Teste de carga mensal do gerador','Prestador','Alta','Concluído','Demo: partida automática validada.',DATE_SUB(NOW(), INTERVAL 6 DAY)),
('mensal','Reservatórios','Caixas d''água','Inspeção de tampas, boias e extravasores','Manutenção','Alta','Pendente','Demo: vistoria mensal aguardando liberação do acesso.',DATE_SUB(NOW(), INTERVAL 4 HOUR)),
('mensal','Controle de pragas','Casas de máquinas','Aplicação preventiva em áreas técnicas','Prestador','Média','Em Andamento','Demo: prestador iniciou pelo setor de bombas.',DATE_SUB(NOW(), INTERVAL 6 HOUR)),
('mensal','Almoxarifado','Ferramentas','Inventário mensal de ferramentas e EPIs','Manutenção','Baixa','Concluído','Demo: inventário conciliado com 2 reposições pendentes.',DATE_SUB(NOW(), INTERVAL 3 DAY)),
('anual','Esgoto','','Limpeza das estações elevatórias','Prestador','Alta','Pendente','Demo: planejamento anual aguardando proposta final.',DATE_SUB(NOW(), INTERVAL 2 DAY)),
('anual','Estrutural','','Inspeção estrutural preventiva','Engenharia/Prestador','Alta','Em Andamento','Demo: relatório preliminar em elaboração.',DATE_SUB(NOW(), INTERVAL 9 DAY)),
('anual','Geral','','Dedetização e desratização','Prestador','Média','Concluído','Demo: certificado anual recebido.',DATE_SUB(NOW(), INTERVAL 20 DAY)),
('anual','Hidráulica','','Limpeza de caixas d''água','Prestador','Alta','Pendente','Demo: janela de execução em aprovação.',DATE_SUB(NOW(), INTERVAL 2 DAY)),
('anual','Incêndio','','Recarga de extintores','Prestador','Alta','Concluído','Demo: recarga e lacres conferidos.',DATE_SUB(NOW(), INTERVAL 12 DAY)),
('anual','Piscinas','','Troca do elemento filtrante','Prestador','Alta','Pendente','Demo: compra do elemento filtrante em andamento.',DATE_SUB(NOW(), INTERVAL 2 DAY));

INSERT INTO tarefas (ciclo,setor,area,atividade,equipe,prioridade,status,observacoes,atualizado_em)
SELECT s.ciclo,s.setor,s.area,s.atividade,s.equipe,s.prioridade,s.status,s.observacoes,s.atualizado_em
FROM seed_tarefas_demo s
WHERE NOT EXISTS (
  SELECT 1 FROM tarefas t
  WHERE t.ciclo = s.ciclo
    AND t.setor = s.setor
    AND COALESCE(t.area,'') = COALESCE(s.area,'')
    AND t.atividade = s.atividade
);

UPDATE tarefas t
JOIN seed_tarefas_demo s
  ON t.ciclo = s.ciclo
 AND t.setor = s.setor
 AND COALESCE(t.area,'') = COALESCE(s.area,'')
 AND t.atividade = s.atividade
SET t.equipe = s.equipe,
    t.prioridade = s.prioridade,
    t.status = s.status,
    t.observacoes = s.observacoes,
    t.atualizado_em = s.atualizado_em
WHERE COALESCE(t.observacoes,'') = ''
   OR t.observacoes LIKE 'Demo:%';

DROP TEMPORARY TABLE seed_tarefas_demo;
