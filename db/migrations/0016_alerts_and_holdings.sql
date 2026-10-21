CREATE TABLE "holdings" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"instrument_id" varchar(40) NOT NULL,
	"quantity" numeric(30, 10) NOT NULL,
	"unit" varchar(8) DEFAULT 'unit' NOT NULL,
	"average_price" numeric(30, 10),
	"note" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "holdings_quantity_positive" CHECK ("holdings"."quantity" > 0),
	CONSTRAINT "holdings_unit_check" CHECK ("holdings"."unit" in ('unit','gram','ounce'))
);
--> statement-breakpoint
CREATE TABLE "price_alerts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"instrument_id" varchar(40) NOT NULL,
	"direction" varchar(8) NOT NULL,
	"target" numeric(30, 10) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"fired_at" timestamp with time zone,
	"fired_price" numeric(30, 10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "price_alerts_direction_check" CHECK ("price_alerts"."direction" in ('above','below')),
	CONSTRAINT "price_alerts_target_positive" CHECK ("price_alerts"."target" > 0)
);
--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "holdings_user_idx" ON "holdings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "price_alerts_user_active_idx" ON "price_alerts" USING btree ("user_id","active");