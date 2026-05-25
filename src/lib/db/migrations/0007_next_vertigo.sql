CREATE TABLE "organization_group_managers" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"group_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_group_user_mgr" UNIQUE("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organization_groups" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"logo_url" text,
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_groups_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_team_user" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team_organization_grants" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"team_id" varchar(36) NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"role" varchar(50) NOT NULL,
	"granted_by_user_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_team_org_grant" UNIQUE("team_id","organization_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"created_by_user_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_activity_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"organization_id" varchar(36),
	"event_type" varchar(50) NOT NULL,
	"resource_id" varchar(36),
	"metadata" json,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invite_links" ALTER COLUMN "organization_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invite_links" ADD COLUMN "team_id" varchar(36);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "group_id" varchar(36);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_context_path" text;--> statement-breakpoint
ALTER TABLE "organization_group_managers" ADD CONSTRAINT "fk_group_mgr_group" FOREIGN KEY ("group_id") REFERENCES "public"."organization_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_group_managers" ADD CONSTRAINT "fk_group_mgr_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "fk_team_members_team" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "fk_team_members_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_organization_grants" ADD CONSTRAINT "fk_grants_team" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_organization_grants" ADD CONSTRAINT "fk_grants_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_organization_grants" ADD CONSTRAINT "fk_grants_granter" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "fk_teams_creator" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_events" ADD CONSTRAINT "fk_activity_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_events" ADD CONSTRAINT "fk_activity_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_group_mgr_group" ON "organization_group_managers" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_group_mgr_user" ON "organization_group_managers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_org_groups_slug" ON "organization_groups" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_team_members_team" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_team_members_user" ON "team_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_grants_team" ON "team_organization_grants" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_grants_org" ON "team_organization_grants" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_teams_slug" ON "teams" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_user_activity_user_date" ON "user_activity_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_activity_org_date" ON "user_activity_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_user_activity_type" ON "user_activity_events" USING btree ("event_type");--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "fk_invite_links_team" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "fk_orgs_group" FOREIGN KEY ("group_id") REFERENCES "public"."organization_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_orgs_group" ON "organizations" USING btree ("group_id");--> statement-breakpoint
ALTER TABLE "invite_links"
  ADD CONSTRAINT "chk_invite_scope_xor"
  CHECK ((organization_id IS NOT NULL)::int + (team_id IS NOT NULL)::int = 1);