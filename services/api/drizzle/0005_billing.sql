CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"code" text NOT NULL,
	"amount_vnd" bigint NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"paid_by" uuid,
	"method" text,
	CONSTRAINT "bills_tenant_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "bills_tenant_code_key" UNIQUE("restaurant_id","code"),
	CONSTRAINT "bills_amount_range" CHECK ("bills"."amount_vnd" between 1 and 9999999999999),
	CONSTRAINT "bills_code_format" CHECK ("bills"."code" ~ '^[0-9A-HJKMNP-TV-Z]{5}$'),
	CONSTRAINT "bills_paid_fields" CHECK (("bills"."status" = 'paid') = ("bills"."paid_at" is not null and "bills"."method" is not null))
);
--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_session_fk" FOREIGN KEY ("restaurant_id","session_id") REFERENCES "public"."table_sessions"("restaurant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bills_one_open_per_session" ON "bills" USING btree ("session_id") WHERE "bills"."status" = 'open';--> statement-breakpoint
CREATE INDEX "bills_session_idx" ON "bills" USING btree ("restaurant_id","session_id","created_at");