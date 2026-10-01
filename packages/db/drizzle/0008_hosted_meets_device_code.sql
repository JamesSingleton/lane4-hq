CREATE TABLE "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp,
	"polling_interval" integer,
	"client_id" text,
	"scope" text,
	CONSTRAINT "device_code_device_code_unique" UNIQUE("device_code"),
	CONSTRAINT "device_code_user_code_unique" UNIQUE("user_code")
);
--> statement-breakpoint
CREATE TABLE "hosted_meets" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" text,
	"course" text NOT NULL,
	"location" text,
	"last_published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_heats" (
	"id" text PRIMARY KEY NOT NULL,
	"hosted_meet_id" text NOT NULL,
	"event_number" integer NOT NULL,
	"round" text NOT NULL,
	"heat" integer NOT NULL,
	"revision" integer NOT NULL,
	"idempotency_key" text NOT NULL,
	"event" jsonb NOT NULL,
	"lanes" jsonb NOT NULL,
	"verified_at" timestamp NOT NULL,
	"published_by_user_id" text,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "device_code" ADD CONSTRAINT "device_code_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hosted_meets" ADD CONSTRAINT "hosted_meets_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_heats" ADD CONSTRAINT "published_heats_hosted_meet_id_hosted_meets_id_fk" FOREIGN KEY ("hosted_meet_id") REFERENCES "public"."hosted_meets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "published_heats" ADD CONSTRAINT "published_heats_published_by_user_id_user_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_code_user_id_idx" ON "device_code" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "hosted_meets_org_idx" ON "hosted_meets" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "published_heats_heat_idx" ON "published_heats" USING btree ("hosted_meet_id","event_number","round","heat");