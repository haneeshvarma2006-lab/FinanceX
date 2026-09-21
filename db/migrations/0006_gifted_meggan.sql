CREATE TABLE "automation_rules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"trigger_type" varchar(48) NOT NULL,
	"trigger_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"action_type" varchar(48) NOT NULL,
	"action_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"rule_id" varchar(36) NOT NULL,
	"status" varchar(16) NOT NULL,
	"reason" text NOT NULL,
	"observed" jsonb,
	"fired_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "automation_runs_status_check" CHECK ("automation_runs"."status" in ('fired','not_matched','suppressed','error'))
);
--> statement-breakpoint
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_rule_id_automation_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."automation_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "automation_rules_user_enabled_idx" ON "automation_rules" USING btree ("user_id","enabled");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_rules_user_name_key" ON "automation_rules" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "automation_runs_rule_fired_idx" ON "automation_runs" USING btree ("rule_id","fired_at");--> statement-breakpoint
CREATE INDEX "automation_runs_user_fired_idx" ON "automation_runs" USING btree ("user_id","fired_at");