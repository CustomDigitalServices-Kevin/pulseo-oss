CREATE TYPE "public"."logo_background" AS ENUM('auto', 'light', 'dark', 'transparent');--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_mime" varchar(50);--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_background" "logo_background" DEFAULT 'auto' NOT NULL;