CREATE TABLE "staff" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "staff_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"issuer" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "staff_rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "staff_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "staff_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "staff_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "support_handoff" DROP CONSTRAINT "support_handoff_operator_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "actor_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "impersonated_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "beta_access_request" ADD COLUMN "reviewed_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "beta_invite" ADD COLUMN "invited_by_staff_id" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_staff_id" text;--> statement-breakpoint
ALTER TABLE "support_handoff" ADD COLUMN "staff_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "staff_account" ADD CONSTRAINT "staff_account_user_id_staff_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_session" ADD CONSTRAINT "staff_session_user_id_staff_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_account_user_id_idx" ON "staff_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_rate_limit_key_idx" ON "staff_rate_limit" USING btree ("key");--> statement-breakpoint
CREATE INDEX "staff_session_user_id_idx" ON "staff_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "staff_verification_identifier_idx" ON "staff_verification" USING btree ("identifier");--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_impersonated_by_staff_id_staff_id_fk" FOREIGN KEY ("impersonated_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_access_request" ADD CONSTRAINT "beta_access_request_reviewed_by_staff_id_staff_id_fk" FOREIGN KEY ("reviewed_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beta_invite" ADD CONSTRAINT "beta_invite_invited_by_staff_id_staff_id_fk" FOREIGN KEY ("invited_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_staff_id_staff_id_fk" FOREIGN KEY ("actor_staff_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_handoff" ADD CONSTRAINT "support_handoff_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_log_staff_created" ON "audit_log" USING btree ("actor_staff_id","created_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "support_handoff" DROP COLUMN "operator_user_id";--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_present" CHECK ("audit_log"."actor_user_id" IS NOT NULL OR "audit_log"."actor_staff_id" IS NOT NULL);