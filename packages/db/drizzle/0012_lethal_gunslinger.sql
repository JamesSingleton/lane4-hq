CREATE TABLE "beta_access_request" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"team" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"reviewed_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "beta_access_request" ADD CONSTRAINT "beta_access_request_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beta_access_request_email_status_idx" ON "beta_access_request" USING btree ("email","status");--> statement-breakpoint
CREATE INDEX "beta_access_request_status_created_idx" ON "beta_access_request" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "beta_access_request_pending_email_idx" ON "beta_access_request" USING btree (lower("email")) WHERE "beta_access_request"."status" = 'pending';