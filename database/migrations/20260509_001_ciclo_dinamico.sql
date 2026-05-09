-- Allows the cycle schedule to be maintained dynamically.

ALTER TABLE ciclo_8dias
  MODIFY setor VARCHAR(80) NOT NULL,
  MODIFY trecho VARCHAR(160) NULL;
