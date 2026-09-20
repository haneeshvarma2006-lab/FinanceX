CREATE TABLE "accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"kind" varchar(24) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"opening_balance_minor" bigint DEFAULT 0 NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_kind_check" CHECK ("accounts"."kind" in ('cash','bank','card','investment','broker','loan'))
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"category_id" varchar(36) NOT NULL,
	"period" varchar(16) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_period_check" CHECK ("budgets"."period" in ('monthly','weekly')),
	CONSTRAINT "budgets_amount_positive" CHECK ("budgets"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(80) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"color" varchar(16),
	"icon" varchar(32),
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_kind_check" CHECK ("categories"."kind" in ('income','expense'))
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"on_date" date NOT NULL,
	"assets_minor" bigint NOT NULL,
	"liabilities_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_revisions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"action" varchar(16) NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"account_id" varchar(36),
	"category_id" varchar(36),
	"name" varchar(120) NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"cadence" varchar(16) NOT NULL,
	"next_due_on" date NOT NULL,
	"last_charged_on" date,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"cancel_by" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_cadence_check" CHECK ("subscriptions"."cadence" in ('weekly','monthly','quarterly','yearly')),
	CONSTRAINT "subscriptions_status_check" CHECK ("subscriptions"."status" in ('active','paused','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"account_id" varchar(36) NOT NULL,
	"category_id" varchar(36),
	"occurred_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" varchar(3) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"description" varchar(240) NOT NULL,
	"merchant" varchar(120),
	"notes" text,
	"transfer_group_id" varchar(36),
	"external_id" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_kind_check" CHECK ("transactions"."kind" in ('income','expense','transfer')),
	CONSTRAINT "transactions_amount_nonzero" CHECK ("transactions"."amount_minor" <> 0)
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_revisions" ADD CONSTRAINT "record_revisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_user_name_key" ON "accounts" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "budgets_user_id_idx" ON "budgets" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_user_category_period_key" ON "budgets" USING btree ("user_id","category_id","starts_on");--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_name_kind_key" ON "categories" USING btree ("user_id","name","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "net_worth_user_date_key" ON "net_worth_snapshots" USING btree ("user_id","on_date");--> statement-breakpoint
CREATE INDEX "record_revisions_entity_idx" ON "record_revisions" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "record_revisions_user_idx" ON "record_revisions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_next_due_idx" ON "subscriptions" USING btree ("user_id","next_due_on");--> statement-breakpoint
CREATE INDEX "transactions_user_occurred_idx" ON "transactions" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transactions_account_occurred_idx" ON "transactions" USING btree ("account_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transactions_user_category_idx" ON "transactions" USING btree ("user_id","category_id");--> statement-breakpoint
CREATE INDEX "transactions_transfer_group_idx" ON "transactions" USING btree ("transfer_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_account_external_key" ON "transactions" USING btree ("account_id","external_id") WHERE "transactions"."external_id" is not null;