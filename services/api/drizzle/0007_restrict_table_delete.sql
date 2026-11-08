ALTER TABLE "table_sessions" DROP CONSTRAINT "table_sessions_table_fk";
--> statement-breakpoint
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_table_fk";
--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_fk" FOREIGN KEY ("restaurant_id","table_id") REFERENCES "public"."dining_tables"("restaurant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_table_fk" FOREIGN KEY ("restaurant_id","table_id") REFERENCES "public"."dining_tables"("restaurant_id","id") ON DELETE no action ON UPDATE no action;