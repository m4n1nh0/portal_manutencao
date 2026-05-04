-- Permite tarefas/modelos compartilhados entre todos os ciclos de manutencao.

ALTER TABLE tarefas
  MODIFY ciclo ENUM('diario','semanal','mensal','anual','todas') NOT NULL;

ALTER TABLE tarefa_modelos
  MODIFY ciclo ENUM('diario','semanal','mensal','anual','todas') NOT NULL;
