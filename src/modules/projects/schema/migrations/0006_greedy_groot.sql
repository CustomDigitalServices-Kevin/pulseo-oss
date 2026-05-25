CREATE TABLE "projects"."proj_github_tokens" (
	"organization_id" varchar(36) PRIMARY KEY NOT NULL,
	"encrypted_token" "bytea" NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_by" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects"."proj_github_tokens" ADD CONSTRAINT "proj_github_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects"."proj_github_tokens" ADD CONSTRAINT "proj_github_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;