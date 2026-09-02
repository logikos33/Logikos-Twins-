-- #45: estado terminal 'cancelled' (o contrato de UI já o previa; faltava o emissor).
-- Aditivo e idempotente; nenhum dado tocado.
ALTER TYPE "ScanStatus" ADD VALUE IF NOT EXISTS 'cancelled';
