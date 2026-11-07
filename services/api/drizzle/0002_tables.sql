CREATE TABLE "dining_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"seats" integer NOT NULL,
	"qr_token" text NOT NULL,
	"qr_rotated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dining_tables_tenant_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "dining_tables_seats_range" CHECK ("dining_tables"."seats" between 1 and 30),
	CONSTRAINT "dining_tables_name_length" CHECK (char_length("dining_tables"."name") between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE "retired_qr_tokens" (
	"qr_token" text PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"retired_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retired_qr_tokens" ADD CONSTRAINT "retired_qr_tokens_table_fk" FOREIGN KEY ("restaurant_id","table_id") REFERENCES "public"."dining_tables"("restaurant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_qr_token_key" ON "dining_tables" USING btree ("qr_token");--> statement-breakpoint
CREATE UNIQUE INDEX "dining_tables_tenant_name_key" ON "dining_tables" USING btree ("restaurant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "dining_tables_tenant_created_idx" ON "dining_tables" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX "retired_qr_tokens_table_idx" ON "retired_qr_tokens" USING btree ("restaurant_id","table_id");