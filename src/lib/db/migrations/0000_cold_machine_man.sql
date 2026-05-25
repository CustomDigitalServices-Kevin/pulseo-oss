CREATE TABLE "audit_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"entity_type" varchar(100) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"action" varchar(100) NOT NULL,
	"actor_id" varchar(36) NOT NULL,
	"changes" json,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"quota_hours" numeric(10, 2) NOT NULL,
	"consumed_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"rate_per_hour" numeric(10, 2) NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_members" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"role" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_org_user" UNIQUE("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"description" text,
	"logo_url" text,
	"color_primary" varchar(7) DEFAULT '#2563EB',
	"color_secondary" varchar(7) DEFAULT '#1E40AF',
	"qonto_client_email" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ticket_attachments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"ticket_id" varchar(36) NOT NULL,
	"uploaded_by_id" varchar(36) NOT NULL,
	"filename" varchar(255) NOT NULL,
	"file_key" varchar(255) NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_comments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"ticket_id" varchar(36) NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"number" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(50) DEFAULT 'new' NOT NULL,
	"priority" varchar(50) DEFAULT 'medium' NOT NULL,
	"category" varchar(100) NOT NULL,
	"contract_id" varchar(36),
	"creator_id" varchar(36) NOT NULL,
	"assigned_to_id" varchar(36),
	"time_spent_minutes" integer DEFAULT 0,
	"client_approval_status" varchar(50),
	"dev_approval_status" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "fk_audit_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "fk_contracts_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "fk_members_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "fk_members_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "fk_attachments_ticket" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_attachments" ADD CONSTRAINT "fk_attachments_user" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "fk_comments_ticket" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_comments" ADD CONSTRAINT "fk_comments_author" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "fk_tickets_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "fk_tickets_creator" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_org" ON "audit_logs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_org" ON "contracts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_status" ON "contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_members_org" ON "organization_members" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_members_user" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_org_slug" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_org_created_at" ON "organizations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_attachments_ticket" ON "ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_attachments_created_at" ON "ticket_attachments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_comments_ticket" ON "ticket_comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "idx_comments_created_at" ON "ticket_comments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_tickets_org" ON "tickets" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_tickets_status" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_tickets_priority" ON "tickets" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_tickets_created_at" ON "tickets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_user_email" ON "users" USING btree ("email");