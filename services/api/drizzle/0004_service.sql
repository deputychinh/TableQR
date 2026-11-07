CREATE TABLE "guest_devices" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigserial NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"name_snapshot" text NOT NULL,
	"price_vnd" integer NOT NULL,
	"is_main" text NOT NULL,
	"quantity" integer NOT NULL,
	"note" text,
	"status" text NOT NULL,
	"queue_at" timestamp with time zone,
	"session_opened_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"served_at" timestamp with time zone,
	"served_by" uuid,
	"skip_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "order_items_tenant_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "order_items_quantity_range" CHECK ("order_items"."quantity" between 1 and 20),
	CONSTRAINT "order_items_note_length" CHECK ("order_items"."note" is null or char_length("order_items"."note") <= 140),
	CONSTRAINT "order_items_price_positive" CHECK ("order_items"."price_vnd" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"hold_reason" text,
	"flag" text,
	"placed_by" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	"decided_by" uuid,
	"total_vnd" integer NOT NULL,
	"rules_snapshot" jsonb NOT NULL,
	CONSTRAINT "orders_tenant_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "orders_session_idempotency_key" UNIQUE("session_id","idempotency_key"),
	CONSTRAINT "orders_total_non_negative" CHECK ("orders"."total_vnd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"party_size" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_by" text NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"booking_id" uuid,
	CONSTRAINT "table_sessions_tenant_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "table_sessions_party_size_range" CHECK ("table_sessions"."party_size" between 1 and 34)
);
--> statement-breakpoint
ALTER TABLE "guest_devices" ADD CONSTRAINT "guest_devices_session_fk" FOREIGN KEY ("restaurant_id","session_id") REFERENCES "public"."table_sessions"("restaurant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_served_by_users_id_fk" FOREIGN KEY ("served_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_fk" FOREIGN KEY ("restaurant_id","order_id") REFERENCES "public"."orders"("restaurant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_fk" FOREIGN KEY ("restaurant_id","menu_item_id") REFERENCES "public"."menu_items"("restaurant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_station_fk" FOREIGN KEY ("restaurant_id","station_id") REFERENCES "public"."stations"("restaurant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_session_fk" FOREIGN KEY ("restaurant_id","session_id") REFERENCES "public"."table_sessions"("restaurant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_fk" FOREIGN KEY ("restaurant_id","table_id") REFERENCES "public"."dining_tables"("restaurant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guest_devices_session_idx" ON "guest_devices" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "order_items_station_queue_idx" ON "order_items" USING btree ("restaurant_id","station_id","status","queue_at","session_opened_at","seq");--> statement-breakpoint
CREATE INDEX "order_items_session_idx" ON "order_items" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_status_idx" ON "orders" USING btree ("restaurant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_one_open_per_table" ON "table_sessions" USING btree ("table_id") WHERE "table_sessions"."status" = 'open';--> statement-breakpoint
CREATE INDEX "table_sessions_tenant_status_idx" ON "table_sessions" USING btree ("restaurant_id","status");