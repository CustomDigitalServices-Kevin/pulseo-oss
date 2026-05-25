CREATE TABLE "accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"id_token" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_links" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"token" varchar(64) NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"created_by" varchar(36) NOT NULL,
	"label" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invite_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tickets" DROP CONSTRAINT "fk_tickets_creator";
--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "creator_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "guest_name" varchar(255);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "guest_email" varchar(255);--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "invite_link_id" varchar(36);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "fk_invite_links_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "fk_invite_links_creator" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invite_links_token" ON "invite_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_invite_links_org" ON "invite_links" USING btree ("organization_id");