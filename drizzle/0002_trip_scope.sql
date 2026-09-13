-- Ties every child row to the trip it belongs to, so a forged child id cannot reach across
-- trips. The existing single-column foreign keys are kept: they own the cascade and set-null
-- behaviour and fire first, so the NO ACTION composites below only constrain the pairing.

-- Reactions had no trip at all, which made them readable and writable through any trip's
-- endpoint. Give them one, backfill from the entity they hang off, and widen the key.
ALTER TABLE "reactions" ADD COLUMN "trip_id" text;--> statement-breakpoint

UPDATE "reactions" r SET trip_id = tp.trip_id FROM "trip_places" tp
  WHERE r.entity_type = 'trip_place' AND r.entity_id = tp.id;--> statement-breakpoint
UPDATE "reactions" r SET trip_id = d.trip_id FROM "itinerary_days" d
  WHERE r.entity_type = 'itinerary_day' AND r.entity_id = d.id;--> statement-breakpoint
UPDATE "reactions" r SET trip_id = i.trip_id FROM "itinerary_items" i
  WHERE r.entity_type = 'itinerary_item' AND r.entity_id = i.id;--> statement-breakpoint
UPDATE "reactions" r SET trip_id = l.trip_id FROM "lodgings" l
  WHERE r.entity_type = 'lodging' AND r.entity_id = l.id;--> statement-breakpoint
UPDATE "reactions" r SET trip_id = res.trip_id FROM "reservations" res
  WHERE r.entity_type = 'reservation' AND r.entity_id = res.id;--> statement-breakpoint
UPDATE "reactions" r SET trip_id = e.trip_id FROM "journal_entries" e
  WHERE r.entity_type = 'journal_entry' AND r.entity_id = e.id;--> statement-breakpoint
UPDATE "reactions" r SET trip_id = t.id FROM "trips" t
  WHERE r.entity_type = 'trip' AND r.entity_id = t.id;--> statement-breakpoint

-- Anything still unmatched points at an entity that no longer exists.
DELETE FROM "reactions" WHERE trip_id IS NULL;--> statement-breakpoint
ALTER TABLE "reactions" ALTER COLUMN "trip_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_trip_id_trips_id_fk"
  FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" DROP CONSTRAINT "reactions_entity_type_entity_id_user_id_emoji_pk";--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_trip_id_entity_type_entity_id_user_id_emoji_pk"
  PRIMARY KEY ("trip_id","entity_type","entity_id","user_id","emoji");--> statement-breakpoint

-- Targets for the composite foreign keys. Redundant next to each table's primary key, but
-- Postgres requires a unique constraint on exactly the referenced column list.
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_id_trip_uk" UNIQUE ("id","trip_id");--> statement-breakpoint
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_id_trip_uk" UNIQUE ("id","trip_id");--> statement-breakpoint
ALTER TABLE "trip_lists" ADD CONSTRAINT "trip_lists_id_trip_uk" UNIQUE ("id","trip_id");--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_id_trip_uk" UNIQUE ("id","trip_id");--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_id_trip_uk" UNIQUE ("id","trip_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_id_trip_uk" UNIQUE ("id","trip_id");--> statement-breakpoint

-- Clear any row that already violates the pairing. On data written before this migration
-- these are orphans the app cannot render, so removing them loses nothing visible.
DELETE FROM "itinerary_items" i
  WHERE NOT EXISTS (
    SELECT 1 FROM "itinerary_days" d WHERE d.id = i.day_id AND d.trip_id = i.trip_id
  );--> statement-breakpoint
UPDATE "itinerary_items" i SET trip_place_id = NULL
  WHERE trip_place_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "trip_places" tp WHERE tp.id = i.trip_place_id AND tp.trip_id = i.trip_id
  );--> statement-breakpoint
UPDATE "trip_places" tp SET list_id = NULL
  WHERE list_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "trip_lists" l WHERE l.id = tp.list_id AND l.trip_id = tp.trip_id
  );--> statement-breakpoint
DELETE FROM "journal_photos" ph
  WHERE NOT EXISTS (
    SELECT 1 FROM "journal_entries" e WHERE e.id = ph.entry_id AND e.trip_id = ph.trip_id
  );--> statement-breakpoint
UPDATE "expenses" e SET trip_place_id = NULL
  WHERE trip_place_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "trip_places" tp WHERE tp.id = e.trip_place_id AND tp.trip_id = e.trip_id
  );--> statement-breakpoint

-- The scoping constraints themselves.
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_day_in_trip_fk"
  FOREIGN KEY ("day_id","trip_id") REFERENCES "public"."itinerary_days"("id","trip_id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_place_in_trip_fk"
  FOREIGN KEY ("trip_place_id","trip_id") REFERENCES "public"."trip_places"("id","trip_id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_list_in_trip_fk"
  FOREIGN KEY ("list_id","trip_id") REFERENCES "public"."trip_lists"("id","trip_id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_photos" ADD CONSTRAINT "journal_photos_entry_in_trip_fk"
  FOREIGN KEY ("entry_id","trip_id") REFERENCES "public"."journal_entries"("id","trip_id")
  ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_place_in_trip_fk"
  FOREIGN KEY ("trip_place_id","trip_id") REFERENCES "public"."trip_places"("id","trip_id")
  ON DELETE no action ON UPDATE no action;
