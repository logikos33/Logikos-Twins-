-- Validade do link compartilhado (piloto). Aditiva; linhas existentes ficam
-- com NULL = sem validade (legado).
ALTER TABLE "scans" ADD COLUMN "share_token_expires_at" TIMESTAMPTZ;
