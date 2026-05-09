-- Permite ciclos dinamicos maiores que 127 dias.

ALTER TABLE ciclo_8dias
  MODIFY dia_ciclo SMALLINT NOT NULL;
