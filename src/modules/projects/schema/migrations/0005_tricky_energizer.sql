CREATE TABLE "projects"."proj_ticket_links" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"ticket_id" varchar(36) NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"deliverable_id" varchar(36),
	"preview_annotation" jsonb,
	"created_by" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects"."proj_ticket_links" ADD CONSTRAINT "proj_ticket_links_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_ticket_links" ADD CONSTRAINT "proj_ticket_links_project_id_proj_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"."proj_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_ticket_links" ADD CONSTRAINT "proj_ticket_links_deliverable_id_proj_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "projects"."proj_deliverables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_ticket_links" ADD CONSTRAINT "proj_ticket_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proj_ticket_links_unique_ticket_project" ON "projects"."proj_ticket_links" USING btree ("ticket_id","project_id");--> statement-breakpoint
CREATE INDEX "proj_ticket_links_project_idx" ON "projects"."proj_ticket_links" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "proj_ticket_links_deliverable_idx" ON "projects"."proj_ticket_links" USING btree ("deliverable_id");