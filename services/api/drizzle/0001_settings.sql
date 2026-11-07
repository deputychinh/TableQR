ALTER TABLE "restaurants" ADD COLUMN "rules_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "bank_bin" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "bank_account" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "bank_account_name" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "bank_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_bank_all_or_none" CHECK (("restaurants"."bank_bin" is null) = ("restaurants"."bank_account" is null) and ("restaurants"."bank_account" is null) = ("restaurants"."bank_account_name" is null));