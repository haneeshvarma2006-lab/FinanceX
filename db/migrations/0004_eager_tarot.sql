CREATE TABLE "pending_registrations" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"provider" varchar(32) NOT NULL,
	"subject" varchar(255) NOT NULL,
	"email" varchar(320) NOT NULL,
	"display_name" varchar(120),
	"avatar_url" text,
	"redirect_to" varchar(512),
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pending_registrations_expires_at_idx" ON "pending_registrations" USING btree ("expires_at");