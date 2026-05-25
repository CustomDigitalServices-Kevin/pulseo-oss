CREATE TYPE "public"."logo_shape" AS ENUM('square', 'rect');--> statement-breakpoint
CREATE TYPE "public"."logo_size" AS ENUM('sm', 'md', 'lg');--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_shape" "logo_shape" DEFAULT 'square' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "logo_size" "logo_size" DEFAULT 'md' NOT NULL;