CREATE TABLE "notes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"title" varchar(160),
	"body" text NOT NULL,
	"mood" varchar(16),
	"pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_body_length" CHECK (char_length("notes"."body") between 1 and 20000),
	CONSTRAINT "notes_mood_check" CHECK ("notes"."mood" is null or "notes"."mood" in ('great','good','okay','low','rough'))
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_user_created_idx" ON "notes" USING btree ("user_id","created_at");