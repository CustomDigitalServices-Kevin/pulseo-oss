CREATE TABLE "user_feedback" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"organization_id" varchar(36),
	"type" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "fk_user_feedback_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "fk_user_feedback_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_feedback_user" ON "user_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_feedback_status" ON "user_feedback" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_user_feedback_created_at" ON "user_feedback" USING btree ("created_at");