CREATE TABLE "organization_responsibles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unique_org_responsible_email" UNIQUE("organization_id","email")
);
--> statement-breakpoint
ALTER TABLE "organization_responsibles" ADD CONSTRAINT "fk_org_responsibles_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_org_responsibles_org" ON "organization_responsibles" USING btree ("organization_id");