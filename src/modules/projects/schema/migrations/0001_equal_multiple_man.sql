CREATE TABLE "projects"."proj_recipe_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"recipe_test_id" varchar(36) NOT NULL,
	"actor_id" varchar(36) NOT NULL,
	"event_type" varchar(40) NOT NULL,
	"old_value" text,
	"new_value" text,
	"note" text,
	"preview_annotation" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects"."proj_recipe_tests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" varchar(36) NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"expected_result" text,
	"status" varchar(20) DEFAULT 'a_faire' NOT NULL,
	"assignee_id" varchar(36),
	"due_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects"."proj_recipe_events" ADD CONSTRAINT "proj_recipe_events_recipe_test_id_proj_recipe_tests_id_fk" FOREIGN KEY ("recipe_test_id") REFERENCES "projects"."proj_recipe_tests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_recipe_events" ADD CONSTRAINT "proj_recipe_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_recipe_tests" ADD CONSTRAINT "proj_recipe_tests_project_id_proj_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"."proj_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_recipe_tests" ADD CONSTRAINT "proj_recipe_tests_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proj_recipe_events_test_created_idx" ON "projects"."proj_recipe_events" USING btree ("recipe_test_id","created_at");--> statement-breakpoint
CREATE INDEX "proj_recipe_tests_project_order_idx" ON "projects"."proj_recipe_tests" USING btree ("project_id","order_index");