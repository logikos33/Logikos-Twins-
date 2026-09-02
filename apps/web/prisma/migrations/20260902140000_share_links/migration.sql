-- Link compartilhado somente-leitura com validade (#47). Aditiva.
CREATE TABLE "share_links" (
  "id" UUID NOT NULL,
  "scan_id" UUID NOT NULL,
  "token" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "revoked_at" TIMESTAMPTZ,
  "views" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "share_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "share_links_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");
CREATE INDEX "share_links_scan_id_idx" ON "share_links"("scan_id");
