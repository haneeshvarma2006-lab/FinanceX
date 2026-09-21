CREATE TABLE "focus_sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"task_id" varchar(36),
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"planned_minutes" integer DEFAULT 25 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goal_checkpoints" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"goal_id" varchar(36) NOT NULL,
	"value" varchar(32) NOT NULL,
	"note" varchar(500),
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"kind" varchar(16) DEFAULT 'numeric' NOT NULL,
	"target_value" varchar(32) NOT NULL,
	"current_value" varchar(32) DEFAULT '0' NOT NULL,
	"unit" varchar(24),
	"currency" varchar(3),
	"habit_id" varchar(36),
	"starts_on" date,
	"target_date" date,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"achieved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goals_kind_check" CHECK ("goals"."kind" in ('numeric','financial','habit','milestone')),
	CONSTRAINT "goals_status_check" CHECK ("goals"."status" in ('active','achieved','abandoned')),
	CONSTRAINT "goals_financial_has_currency" CHECK ("goals"."kind" <> 'financial' or "goals"."currency" is not null)
);
--> statement-breakpoint
CREATE TABLE "habit_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"habit_id" varchar(36) NOT NULL,
	"on_date" date NOT NULL,
	"count" smallint DEFAULT 1 NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habit_entries_count_positive" CHECK ("habit_entries"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"color" varchar(16),
	"cadence" varchar(16) DEFAULT 'daily' NOT NULL,
	"target_per_period" smallint DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habits_cadence_check" CHECK ("habits"."cadence" in ('daily','weekly')),
	CONSTRAINT "habits_target_positive" CHECK ("habits"."target_per_period" > 0)
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"kind" varchar(40) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"kind" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" varchar(1000),
	"href" varchar(300),
	"entity_type" varchar(40),
	"entity_id" varchar(36),
	"dedupe_key" varchar(200),
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(500),
	"color" varchar(16),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"project_id" varchar(36),
	"title" varchar(240) NOT NULL,
	"notes" text,
	"status" varchar(16) DEFAULT 'todo' NOT NULL,
	"priority" smallint DEFAULT 3 NOT NULL,
	"due_at" timestamp with time zone,
	"scheduled_for" date,
	"estimate_minutes" integer,
	"completed_at" timestamp with time zone,
	"rrule" varchar(500),
	"recurrence_parent_id" varchar(36),
	"sort_key" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" in ('todo','doing','done','cancelled')),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" between 1 and 4),
	CONSTRAINT "tasks_completed_consistency" CHECK (("tasks"."status" = 'done') = ("tasks"."completed_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_checkpoints" ADD CONSTRAINT "goal_checkpoints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_checkpoints" ADD CONSTRAINT "goal_checkpoints_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_entries" ADD CONSTRAINT "habit_entries_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "focus_sessions_user_started_idx" ON "focus_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "goal_checkpoints_goal_recorded_idx" ON "goal_checkpoints" USING btree ("goal_id","recorded_at");--> statement-breakpoint
CREATE INDEX "goals_user_status_idx" ON "goals" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "goals_user_target_date_idx" ON "goals" USING btree ("user_id","target_date");--> statement-breakpoint
CREATE UNIQUE INDEX "habit_entries_habit_date_key" ON "habit_entries" USING btree ("habit_id","on_date");--> statement-breakpoint
CREATE INDEX "habit_entries_user_date_idx" ON "habit_entries" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "habits_user_id_idx" ON "habits" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "habits_user_name_key" ON "habits" USING btree ("user_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_user_kind_key" ON "notification_preferences" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","created_at") WHERE "notifications"."read_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_key" ON "notifications" USING btree ("user_id","dedupe_key") WHERE "notifications"."dedupe_key" is not null;--> statement-breakpoint
CREATE INDEX "projects_user_id_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_name_key" ON "projects" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "tasks_user_status_scheduled_idx" ON "tasks" USING btree ("user_id","status","scheduled_for");--> statement-breakpoint
CREATE INDEX "tasks_user_due_idx" ON "tasks" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "tasks_project_idx" ON "tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "tasks_recurrence_parent_idx" ON "tasks" USING btree ("recurrence_parent_id");