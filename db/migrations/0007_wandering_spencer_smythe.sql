CREATE TABLE "change_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"op" varchar(8) NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "goal_checkpoints" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "habit_entries" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "habits" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_executions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "trade_notes" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "trading_accounts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "change_log_user_id_idx" ON "change_log" USING btree ("user_id","id");--> statement-breakpoint
-- ============================================================================
-- Change-log triggers.
--
-- Written here rather than in the repositories because a repository can forget
-- and a trigger cannot be bypassed. A missed delete is the one failure mode
-- that makes offline sync resurrect data, so completeness is enforced by the
-- database.
-- ============================================================================
CREATE OR REPLACE FUNCTION kylix_log_change() RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    INSERT INTO change_log (user_id, entity_type, entity_id, op)
    VALUES (OLD.user_id, TG_ARGV[0], OLD.id, 'deleted');
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO change_log (user_id, entity_type, entity_id, op)
    VALUES (NEW.user_id, TG_ARGV[0], NEW.id, 'updated');
    RETURN NEW;
  ELSE
    INSERT INTO change_log (user_id, entity_type, entity_id, op)
    VALUES (NEW.user_id, TG_ARGV[0], NEW.id, 'created');
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS tasks_change_log ON "tasks";--> statement-breakpoint
CREATE TRIGGER tasks_change_log
AFTER INSERT OR UPDATE OR DELETE ON "tasks"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('tasks');
--> statement-breakpoint
DROP TRIGGER IF EXISTS projects_change_log ON "projects";--> statement-breakpoint
CREATE TRIGGER projects_change_log
AFTER INSERT OR UPDATE OR DELETE ON "projects"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('projects');
--> statement-breakpoint
DROP TRIGGER IF EXISTS habits_change_log ON "habits";--> statement-breakpoint
CREATE TRIGGER habits_change_log
AFTER INSERT OR UPDATE OR DELETE ON "habits"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('habits');
--> statement-breakpoint
DROP TRIGGER IF EXISTS habit_entries_change_log ON "habit_entries";--> statement-breakpoint
CREATE TRIGGER habit_entries_change_log
AFTER INSERT OR UPDATE OR DELETE ON "habit_entries"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('habit_entries');
--> statement-breakpoint
DROP TRIGGER IF EXISTS goals_change_log ON "goals";--> statement-breakpoint
CREATE TRIGGER goals_change_log
AFTER INSERT OR UPDATE OR DELETE ON "goals"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('goals');
--> statement-breakpoint
DROP TRIGGER IF EXISTS goal_checkpoints_change_log ON "goal_checkpoints";--> statement-breakpoint
CREATE TRIGGER goal_checkpoints_change_log
AFTER INSERT OR UPDATE OR DELETE ON "goal_checkpoints"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('goal_checkpoints');
--> statement-breakpoint
DROP TRIGGER IF EXISTS focus_sessions_change_log ON "focus_sessions";--> statement-breakpoint
CREATE TRIGGER focus_sessions_change_log
AFTER INSERT OR UPDATE OR DELETE ON "focus_sessions"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('focus_sessions');
--> statement-breakpoint
DROP TRIGGER IF EXISTS accounts_change_log ON "accounts";--> statement-breakpoint
CREATE TRIGGER accounts_change_log
AFTER INSERT OR UPDATE OR DELETE ON "accounts"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('accounts');
--> statement-breakpoint
DROP TRIGGER IF EXISTS categories_change_log ON "categories";--> statement-breakpoint
CREATE TRIGGER categories_change_log
AFTER INSERT OR UPDATE OR DELETE ON "categories"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('categories');
--> statement-breakpoint
DROP TRIGGER IF EXISTS transactions_change_log ON "transactions";--> statement-breakpoint
CREATE TRIGGER transactions_change_log
AFTER INSERT OR UPDATE OR DELETE ON "transactions"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('transactions');
--> statement-breakpoint
DROP TRIGGER IF EXISTS budgets_change_log ON "budgets";--> statement-breakpoint
CREATE TRIGGER budgets_change_log
AFTER INSERT OR UPDATE OR DELETE ON "budgets"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('budgets');
--> statement-breakpoint
DROP TRIGGER IF EXISTS subscriptions_change_log ON "subscriptions";--> statement-breakpoint
CREATE TRIGGER subscriptions_change_log
AFTER INSERT OR UPDATE OR DELETE ON "subscriptions"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('subscriptions');
--> statement-breakpoint
DROP TRIGGER IF EXISTS trades_change_log ON "trades";--> statement-breakpoint
CREATE TRIGGER trades_change_log
AFTER INSERT OR UPDATE OR DELETE ON "trades"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('trades');
--> statement-breakpoint
DROP TRIGGER IF EXISTS trade_executions_change_log ON "trade_executions";--> statement-breakpoint
CREATE TRIGGER trade_executions_change_log
AFTER INSERT OR UPDATE OR DELETE ON "trade_executions"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('trade_executions');
--> statement-breakpoint
DROP TRIGGER IF EXISTS trade_notes_change_log ON "trade_notes";--> statement-breakpoint
CREATE TRIGGER trade_notes_change_log
AFTER INSERT OR UPDATE OR DELETE ON "trade_notes"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('trade_notes');
--> statement-breakpoint
DROP TRIGGER IF EXISTS trading_accounts_change_log ON "trading_accounts";--> statement-breakpoint
CREATE TRIGGER trading_accounts_change_log
AFTER INSERT OR UPDATE OR DELETE ON "trading_accounts"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('trading_accounts');
--> statement-breakpoint
DROP TRIGGER IF EXISTS strategies_change_log ON "strategies";--> statement-breakpoint
CREATE TRIGGER strategies_change_log
AFTER INSERT OR UPDATE OR DELETE ON "strategies"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('strategies');
--> statement-breakpoint
DROP TRIGGER IF EXISTS automation_rules_change_log ON "automation_rules";--> statement-breakpoint
CREATE TRIGGER automation_rules_change_log
AFTER INSERT OR UPDATE OR DELETE ON "automation_rules"
FOR EACH ROW EXECUTE FUNCTION kylix_log_change('automation_rules');
