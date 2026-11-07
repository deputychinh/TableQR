CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_tenant_id_key" UNIQUE("restaurant_id","id")
);
--> statement-breakpoint
CREATE TABLE "menu_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_vnd" integer NOT NULL,
	"description" text,
	"available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "menu_items_tenant_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "menu_items_price_vnd_check" CHECK ("menu_items"."price_vnd" between 1000 and 100000000)
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"late_after_minutes" integer DEFAULT 15 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stations_tenant_id_key" UNIQUE("restaurant_id","id"),
	CONSTRAINT "stations_late_after_minutes_check" CHECK ("stations"."late_after_minutes" between 1 and 120)
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_fk" FOREIGN KEY ("restaurant_id","category_id") REFERENCES "public"."categories"("restaurant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_station_fk" FOREIGN KEY ("restaurant_id","station_id") REFERENCES "public"."stations"("restaurant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_name_key" ON "categories" USING btree ("restaurant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "categories_tenant_sort_idx" ON "categories" USING btree ("restaurant_id","sort_order");--> statement-breakpoint
CREATE INDEX "menu_items_tenant_category_idx" ON "menu_items" USING btree ("restaurant_id","category_id");--> statement-breakpoint
CREATE INDEX "menu_items_tenant_station_idx" ON "menu_items" USING btree ("restaurant_id","station_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stations_tenant_name_key" ON "stations" USING btree ("restaurant_id",lower("name"));