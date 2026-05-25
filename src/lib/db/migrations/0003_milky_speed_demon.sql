ALTER TABLE "contracts" ADD COLUMN "sla_response_hours" integer;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "sla_resolution_hours" integer;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "tags" text[] DEFAULT ARRAY[]::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "resolution_due_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_tickets_org_status" ON "tickets" USING btree ("organization_id","status");--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "unique_org_ticket_number" UNIQUE("organization_id","number");