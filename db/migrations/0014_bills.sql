CREATE TABLE "bills" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"transaction_id" varchar(36),
	"storage_key" varchar(300) NOT NULL,
	"content_type" varchar(40) NOT NULL,
	"size_bytes" integer NOT NULL,
	"merchant" varchar(120),
	"amount_minor" bigint,
	"currency" varchar(3),
	"bill_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bills_size_positive" CHECK ("bills"."size_bytes" > 0)
);
--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bills_user_created_idx" ON "bills" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "bills_transaction_idx" ON "bills" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_storage_key" ON "bills" USING btree ("storage_key");