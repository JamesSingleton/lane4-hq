CREATE TABLE "support_handoff" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"operator_user_id" text NOT NULL,
	"target_user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "support_handoff" ADD CONSTRAINT "support_handoff_operator_user_id_user_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_handoff" ADD CONSTRAINT "support_handoff_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "support_handoff_token_hash_idx" ON "support_handoff" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "support_handoff_expires_idx" ON "support_handoff" USING btree ("expires_at");