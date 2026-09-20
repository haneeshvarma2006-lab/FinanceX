CREATE TABLE "strategies" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"rules" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_executions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"trade_id" varchar(36) NOT NULL,
	"side" varchar(8) NOT NULL,
	"quantity" numeric(24, 8) NOT NULL,
	"price" numeric(24, 8) NOT NULL,
	"fee_minor" bigint DEFAULT 0 NOT NULL,
	"executed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_executions_side_check" CHECK ("trade_executions"."side" in ('buy','sell')),
	CONSTRAINT "trade_executions_quantity_positive" CHECK ("trade_executions"."quantity" > 0),
	CONSTRAINT "trade_executions_price_nonneg" CHECK ("trade_executions"."price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "trade_notes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"trade_id" varchar(36) NOT NULL,
	"kind" varchar(16) NOT NULL,
	"body" text NOT NULL,
	"emotion_tag" varchar(32),
	"confidence" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trade_notes_kind_check" CHECK ("trade_notes"."kind" in ('thesis','review','psychology')),
	CONSTRAINT "trade_notes_confidence_range" CHECK ("trade_notes"."confidence" is null or ("trade_notes"."confidence" between 1 and 5))
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"trading_account_id" varchar(36) NOT NULL,
	"strategy_id" varchar(36),
	"symbol" varchar(32) NOT NULL,
	"asset_class" varchar(16) DEFAULT 'equity' NOT NULL,
	"direction" varchar(8) NOT NULL,
	"status" varchar(16) DEFAULT 'planned' NOT NULL,
	"opened_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"quantity" numeric(24, 8) DEFAULT '0' NOT NULL,
	"average_entry_price" numeric(24, 8),
	"average_exit_price" numeric(24, 8),
	"stop_price" numeric(24, 8),
	"target_price" numeric(24, 8),
	"fees_minor" bigint DEFAULT 0 NOT NULL,
	"realized_pnl_minor" bigint DEFAULT 0 NOT NULL,
	"planned_risk_minor" bigint,
	"r_multiple" numeric(24, 8),
	"currency" varchar(3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trades_direction_check" CHECK ("trades"."direction" in ('long','short')),
	CONSTRAINT "trades_status_check" CHECK ("trades"."status" in ('planned','open','closed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "trading_accounts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"broker" varchar(120),
	"currency" varchar(3) NOT NULL,
	"starting_balance_minor" bigint DEFAULT 0 NOT NULL,
	"risk_per_trade_bps" smallint DEFAULT 100 NOT NULL,
	"environment" varchar(16) DEFAULT 'live' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trading_accounts_environment_check" CHECK ("trading_accounts"."environment" in ('live','paper','backtest'))
);
--> statement-breakpoint
ALTER TABLE "strategies" ADD CONSTRAINT "strategies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD CONSTRAINT "trade_executions_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_notes" ADD CONSTRAINT "trade_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_notes" ADD CONSTRAINT "trade_notes_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_trading_account_id_trading_accounts_id_fk" FOREIGN KEY ("trading_account_id") REFERENCES "public"."trading_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_strategy_id_strategies_id_fk" FOREIGN KEY ("strategy_id") REFERENCES "public"."strategies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD CONSTRAINT "trading_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "strategies_user_id_idx" ON "strategies" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "strategies_user_name_key" ON "strategies" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "trade_executions_trade_idx" ON "trade_executions" USING btree ("trade_id","executed_at");--> statement-breakpoint
CREATE INDEX "trade_executions_user_idx" ON "trade_executions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trade_notes_trade_idx" ON "trade_notes" USING btree ("trade_id","created_at");--> statement-breakpoint
CREATE INDEX "trades_user_opened_idx" ON "trades" USING btree ("user_id","opened_at");--> statement-breakpoint
CREATE INDEX "trades_account_status_idx" ON "trades" USING btree ("trading_account_id","status");--> statement-breakpoint
CREATE INDEX "trades_user_symbol_idx" ON "trades" USING btree ("user_id","symbol");--> statement-breakpoint
CREATE INDEX "trades_strategy_idx" ON "trades" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "trading_accounts_user_id_idx" ON "trading_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trading_accounts_user_name_key" ON "trading_accounts" USING btree ("user_id","name");