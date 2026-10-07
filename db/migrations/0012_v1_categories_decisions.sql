CREATE TABLE "decisions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"title" varchar(200) NOT NULL,
	"area" varchar(16) DEFAULT 'life' NOT NULL,
	"reasoning" text,
	"expected" text,
	"confidence" smallint,
	"review_on" date,
	"outcome" text,
	"verdict" varchar(16),
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_area_check" CHECK ("decisions"."area" in ('work','money','trading','life')),
	CONSTRAINT "decisions_verdict_check" CHECK ("decisions"."verdict" is null or "decisions"."verdict" in ('right','mixed','wrong')),
	CONSTRAINT "decisions_confidence_range" CHECK ("decisions"."confidence" is null or "decisions"."confidence" between 1 and 5),
	CONSTRAINT "decisions_reasoning_length" CHECK (char_length("decisions"."reasoning") <= 4000),
	CONSTRAINT "decisions_expected_length" CHECK (char_length("decisions"."expected") <= 2000),
	CONSTRAINT "decisions_outcome_length" CHECK (char_length("decisions"."outcome") <= 4000)
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "category" varchar(16);--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decisions_user_created_idx" ON "decisions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "decisions_user_review_idx" ON "decisions" USING btree ("user_id","review_on");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_category_check" CHECK ("tasks"."category" is null or "tasks"."category" in ('work','trading','gym','eating','sleeping'));