CREATE TABLE "projects"."proj_scan_jobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"entity_type" varchar(20) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"file_path" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"signature" varchar(200),
	"scanned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects"."proj_deliverables" ALTER COLUMN "virus_scan_status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "projects"."proj_documents" ALTER COLUMN "virus_scan_status" SET DEFAULT 'pending';--> statement-breakpoint
-- Backfill P4c : les rows P2 existantes ('skipped') sont supposées safe
-- (upload contexte P2 en prod manuelle par superadmin). Backfill à 'clean'
-- pour que la route download fail-closed ne les refuse pas après déploiement.
UPDATE "projects"."proj_documents" SET "virus_scan_status" = 'clean' WHERE "virus_scan_status" = 'skipped';--> statement-breakpoint
UPDATE "projects"."proj_deliverables" SET "virus_scan_status" = 'clean' WHERE "virus_scan_status" = 'skipped';--> statement-breakpoint
CREATE INDEX "proj_scan_jobs_pending_idx" ON "projects"."proj_scan_jobs" USING btree ("status","created_at") WHERE "projects"."proj_scan_jobs"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "proj_scan_jobs_entity_idx" ON "projects"."proj_scan_jobs" USING btree ("entity_type","entity_id");