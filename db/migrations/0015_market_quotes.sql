CREATE TABLE "market_quotes" (
	"id" varchar(40) PRIMARY KEY NOT NULL,
	"provider" varchar(20) NOT NULL,
	"quote" jsonb,
	"error" varchar(80),
	"attempted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone
);
