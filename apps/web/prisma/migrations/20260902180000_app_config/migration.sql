-- #39: config persistente do admin (usdBrlRate, gpuUsdPerS). Key-value de 1 nível;
-- aditiva e idempotente.
CREATE TABLE IF NOT EXISTS "app_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_config_pkey" PRIMARY KEY ("key")
);
