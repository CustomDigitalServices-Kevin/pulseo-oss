CREATE TABLE "projects"."proj_documents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"category" varchar(20) NOT NULL,
	"file_path" text NOT NULL,
	"original_name" varchar(500) NOT NULL,
	"mime_type" varchar(120) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"virus_scan_status" varchar(20) DEFAULT 'skipped' NOT NULL,
	"deleted_at" timestamp with time zone,
	"uploaded_by" varchar(36) NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects"."proj_documents" ADD CONSTRAINT "proj_documents_project_id_proj_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"."proj_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_documents" ADD CONSTRAINT "proj_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proj_documents_project_uploaded_idx" ON "projects"."proj_documents" USING btree ("project_id","uploaded_at");