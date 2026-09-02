-- Projeto + link de captura sem cadastro (#38). Aditiva, forward-only:
-- scans existentes ficam órfãos (project_id NULL) e continuam válidos.
CREATE TABLE "projects" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "capture_token" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMPTZ,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "projects_capture_token_key" ON "projects"("capture_token");

ALTER TABLE "scans" ADD COLUMN "project_id" UUID;
ALTER TABLE "scans" ADD CONSTRAINT "scans_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "scans_project_id_idx" ON "scans"("project_id");
