-- Development seed: task templates derived from the demo task portfolio.

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
