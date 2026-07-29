-- Development seed: task templates derived from the demo task portfolio.
-- Multi-tenant: os modelos ficam no condominio de demonstracao.

SET @cond := (SELECT id FROM condominios WHERE slug = 'principal');

INSERT INTO tarefa_modelos (condominio_id,ciclo,setor,area,atividade,equipe,prioridade)
SELECT DISTINCT @cond,t.ciclo,t.setor,t.area,t.atividade,t.equipe,
  CASE WHEN t.prioridade = 'Média' THEN 'Media' ELSE t.prioridade END AS prioridade
FROM tarefas t
WHERE t.condominio_id = @cond
  AND NOT EXISTS (
    SELECT 1 FROM tarefa_modelos m
    WHERE m.condominio_id = @cond
      AND m.ciclo = t.ciclo
      AND m.setor = t.setor
      AND COALESCE(m.area,'') = COALESCE(t.area,'')
      AND m.atividade = t.atividade
  );
