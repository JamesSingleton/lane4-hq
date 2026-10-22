CREATE TABLE "beta_invite" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"invited_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"accepted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "beta_invite" ADD CONSTRAINT "beta_invite_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "beta_invite_token_idx" ON "beta_invite" USING btree ("token");--> statement-breakpoint
CREATE INDEX "beta_invite_email_status_idx" ON "beta_invite" USING btree ("email","status");