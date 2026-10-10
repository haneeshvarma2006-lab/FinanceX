ALTER TABLE "notes" DROP CONSTRAINT "notes_body_length";--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "ink" jsonb;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_ink_size" CHECK ("notes"."ink" is null or octet_length("notes"."ink"::text) <= 1500000);--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_body_length" CHECK (char_length("notes"."body") <= 20000 and (char_length("notes"."body") >= 1 or "notes"."ink" is not null));