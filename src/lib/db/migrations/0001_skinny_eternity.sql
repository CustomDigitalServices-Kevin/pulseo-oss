CREATE TABLE "documents" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"organization_id" varchar(36) NOT NULL,
	"title" varchar(255) NOT NULL,
	"type" varchar(50) NOT NULL,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"filename" varchar(255),
	"file_key" varchar(255),
	"file_size_bytes" integer,
	"mime_type" varchar(100),
	"amount" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'EUR',
	"status" varchar(50) DEFAULT 'active',
	"qonto_id" varchar(255),
	"qonto_pdf_url" text,
	"issued_at" timestamp with time zone,
	"uploaded_by_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "fk_documents_org" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_documents_org" ON "documents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_documents_type" ON "documents" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_documents_created_at" ON "documents" USING btree ("created_at");