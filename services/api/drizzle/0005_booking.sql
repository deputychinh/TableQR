-- Hand-written (ADR 0007): drizzle-kit cannot express the extension or the exclusion constraint.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"party_size" integer NOT NULL,
	"guest_name" text,
	"guest_phone" text,
	"note" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"slot" "tstzrange" GENERATED ALWAYS AS (tstzrange("starts_at", "ends_at", '[)')) STORED,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"personal_data_erased_at" timestamp with time zone,
	CONSTRAINT "bookings_tenant_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "bookings_tenant_idempotency_key" UNIQUE("restaurant_id","idempotency_key"),
	CONSTRAINT "bookings_party_size_range" CHECK ("bookings"."party_size" between 1 and 30),
	CONSTRAINT "bookings_slot_order" CHECK ("bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_guest_name_length" CHECK ("bookings"."guest_name" is null or char_length("bookings"."guest_name") between 2 and 60),
	CONSTRAINT "bookings_note_length" CHECK ("bookings"."note" is null or char_length("bookings"."note") <= 140),
	CONSTRAINT "bookings_personal_data_together" CHECK (("bookings"."guest_name" is null) = ("bookings"."guest_phone" is null))
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_table_fk" FOREIGN KEY ("restaurant_id","table_id") REFERENCES "public"."dining_tables"("restaurant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_tenant_starts_idx" ON "bookings" USING btree ("restaurant_id","starts_at");--> statement-breakpoint
CREATE INDEX "bookings_tenant_phone_created_idx" ON "bookings" USING btree ("restaurant_id","guest_phone","created_at");--> statement-breakpoint
CREATE INDEX "bookings_retention_idx" ON "bookings" USING btree ("ends_at") WHERE "bookings"."guest_phone" is not null;--> statement-breakpoint
-- Hand-written (ADR 0007): no two active bookings of one table overlap (AC50).
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap" EXCLUDE USING gist ("table_id" WITH =, "slot" WITH &&) WHERE ("status" IN ('pending', 'confirmed', 'seated'));
