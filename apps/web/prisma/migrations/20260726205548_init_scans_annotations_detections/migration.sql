-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('recording', 'uploading', 'uploaded', 'queued', 'processing', 'postprocessing', 'done', 'error');

-- CreateTable
CREATE TABLE "scans" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ScanStatus" NOT NULL DEFAULT 'recording',
    "title" TEXT,
    "share_token" TEXT NOT NULL,
    "video_key" TEXT,
    "video_ext" TEXT NOT NULL DEFAULT 'mp4',
    "video_bytes" BIGINT,
    "duration_s" DOUBLE PRECISION,
    "video_deleted_at" TIMESTAMPTZ,
    "upload_id" TEXT,
    "extract_fps" INTEGER NOT NULL DEFAULT 8,
    "frames" INTEGER,
    "runpod_job_id" TEXT,
    "error_msg" TEXT,
    "outputs" JSONB,
    "metrics" JSONB,
    "scale" JSONB,

    CONSTRAINT "scans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annotations" (
    "id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "position" JSONB NOT NULL,
    "data" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detections" (
    "id" UUID NOT NULL,
    "scan_id" UUID NOT NULL,
    "frame_idx" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "bbox" JSONB NOT NULL,
    "world_pos" JSONB,

    CONSTRAINT "detections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scans_share_token_key" ON "scans"("share_token");

-- CreateIndex
CREATE INDEX "scans_status_created_at_idx" ON "scans"("status", "created_at");

-- CreateIndex
CREATE INDEX "annotations_scan_id_idx" ON "annotations"("scan_id");

-- CreateIndex
CREATE INDEX "detections_scan_id_label_idx" ON "detections"("scan_id", "label");

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detections" ADD CONSTRAINT "detections_scan_id_fkey" FOREIGN KEY ("scan_id") REFERENCES "scans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
