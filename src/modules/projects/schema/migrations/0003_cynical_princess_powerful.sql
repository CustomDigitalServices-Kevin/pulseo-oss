CREATE TABLE "projects"."proj_deliverables" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"version" varchar(40) NOT NULL,
	"is_latest" boolean DEFAULT false NOT NULL,
	"file_path" text,
	"original_name" varchar(500),
	"mime_type" varchar(120),
	"size_bytes" bigint,
	"github_url" text,
	"github_branch" varchar(200),
	"virus_scan_status" varchar(20) DEFAULT 'skipped' NOT NULL,
	"preview_status" varchar(20),
	"preview_manifest_path" text,
	"deleted_at" timestamp with time zone,
	"uploaded_by" varchar(36) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."proj_preview_jobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"deliverable_id" varchar(36) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects"."proj_deliverables" ADD CONSTRAINT "proj_deliverables_project_id_proj_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"."proj_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_deliverables" ADD CONSTRAINT "proj_deliverables_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_preview_jobs" ADD CONSTRAINT "proj_preview_jobs_deliverable_id_proj_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "projects"."proj_deliverables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proj_deliverables_project_uploaded_idx" ON "projects"."proj_deliverables" USING btree ("project_id","uploaded_at") WHERE "projects"."proj_deliverables"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "proj_deliverables_latest_file_idx" ON "projects"."proj_deliverables" USING btree ("project_id") WHERE "projects"."proj_deliverables"."is_latest" = true AND "projects"."proj_deliverables"."kind" = 'file' AND "projects"."proj_deliverables"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "proj_preview_jobs_pending_idx" ON "projects"."proj_preview_jobs" USING btree ("status","created_at") WHERE "projects"."proj_preview_jobs"."status" = 'pending';