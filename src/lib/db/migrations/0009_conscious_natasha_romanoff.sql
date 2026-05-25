ALTER TABLE "users" ADD COLUMN "first_name" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_name" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "job_title" varchar(120);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "locale" varchar(5) DEFAULT 'fr' NOT NULL;