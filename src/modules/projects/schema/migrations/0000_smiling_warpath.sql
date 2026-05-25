CREATE SCHEMA IF NOT EXISTS "projects";
--> statement-breakpoint
CREATE TABLE "projects"."proj_audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"actor_id" varchar(36),
	"event_type" varchar(80) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."proj_projects" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(20) NOT NULL,
	"status" varchar(20) NOT NULL,
	"description" text,
	"started_at" timestamp with time zone,
	"target_date" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_by" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects"."proj_audit_logs" ADD CONSTRAINT "proj_audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_audit_logs" ADD CONSTRAINT "proj_audit_logs_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_projects" ADD CONSTRAINT "proj_projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_projects" ADD CONSTRAINT "proj_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proj_audit_org_created_idx" ON "projects"."proj_audit_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "proj_audit_event_created_idx" ON "projects"."proj_audit_logs" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "proj_projects_org_status_idx" ON "projects"."proj_projects" USING btree ("organization_id","status") WHERE "projects"."proj_projects"."deleted_at" IS NULL;