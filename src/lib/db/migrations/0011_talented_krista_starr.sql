CREATE TABLE "rgpd_deletion_requests" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"processed_by" varchar(36),
	"processing_notes" text
);
--> statement-breakpoint
ALTER TABLE "rgpd_deletion_requests" ADD CONSTRAINT "fk_rgpd_deletion_user" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rgpd_deletion_requests" ADD CONSTRAINT "fk_rgpd_deletion_processed_by" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_rgpd_deletion_status" ON "rgpd_deletion_requests" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "idx_rgpd_deletion_user" ON "rgpd_deletion_requests" USING btree ("user_id");