-- Agendamento de tarefas e filtros por data.

ALTER TABLE tarefas
  ADD COLUMN data_agendada DATE NULL AFTER observacoes,
  ADD COLUMN data_limite DATE NULL AFTER data_agendada,
  ADD COLUMN origem_agendamento VARCHAR(30) NULL AFTER data_limite,
  ADD INDEX idx_tarefas_data_agendada (data_agendada),
  ADD INDEX idx_tarefas_data_limite (data_limite);

UPDATE tarefas
SET data_agendada = DATE(criado_em)
WHERE data_agendada IS NULL;
