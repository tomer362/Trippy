CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TYPE "public"."friendship_status" AS ENUM('pending', 'accepted', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."destination_kind" AS ENUM('country', 'region', 'city', 'island', 'neighborhood', 'park');--> statement-breakpoint
CREATE TYPE "public"."place_source" AS ENUM('google', 'manual');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."section_kind" AS ENUM('notes', 'reservations', 'places', 'itinerary', 'budget', 'checklists', 'journal', 'explore', 'custom');--> statement-breakpoint
CREATE TYPE "public"."travel_mode" AS ENUM('drive', 'walk', 'transit', 'bicycle');--> statement-breakpoint
CREATE TYPE "public"."trip_kind" AS ENUM('plan', 'guide', 'journal');--> statement-breakpoint
CREATE TYPE "public"."trip_visibility" AS ENUM('private', 'link', 'friends', 'public');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('place', 'note', 'checklist', 'lodging', 'reservation', 'expense', 'break');--> statement-breakpoint
CREATE TYPE "public"."list_kind" AS ENUM('places', 'restaurants', 'hotels', 'custom');--> statement-breakpoint
CREATE TYPE "public"."reservation_kind" AS ENUM('flight', 'train', 'bus', 'ferry', 'car', 'restaurant', 'activity', 'other');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('flights', 'lodging', 'transport', 'food', 'activities', 'shopping', 'fees', 'other');--> statement-breakpoint
CREATE TYPE "public"."split_mode" AS ENUM('equal', 'exact', 'shares', 'percent', 'none');--> statement-breakpoint
CREATE TYPE "public"."checklist_kind" AS ENUM('packing', 'todo', 'custom');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "follow" (
	"follower_id" text NOT NULL,
	"followee_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_follower_id_followee_id_pk" PRIMARY KEY("follower_id","followee_id")
);
--> statement-breakpoint
CREATE TABLE "friendship" (
	"requester_id" text NOT NULL,
	"addressee_id" text NOT NULL,
	"status" "friendship_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "friendship_requester_id_addressee_id_pk" PRIMARY KEY("requester_id","addressee_id")
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"bio" text,
	"home_currency" text DEFAULT 'USD' NOT NULL,
	"home_destination_id" text,
	"is_public" boolean DEFAULT true NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"notify_invites" boolean DEFAULT true NOT NULL,
	"notify_comments" boolean DEFAULT true NOT NULL,
	"notify_trip_reminders" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "destinations" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" "destination_kind" NOT NULL,
	"parent_id" text,
	"country_code" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"bbox" jsonb,
	"population" integer,
	"popularity" real DEFAULT 0 NOT NULL,
	"wikidata_qid" text,
	"wikipedia_title" text,
	"geonames_id" integer,
	"google_place_id" text,
	"hero_url" text,
	"hero_credit" text,
	"hero_license" text,
	"hero_resolved_at" timestamp with time zone,
	"alt_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"ancestor_names" text[] DEFAULT '{}'::text[] NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "destinations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "place_source" DEFAULT 'google' NOT NULL,
	"google_place_id" text,
	"name" text NOT NULL,
	"formatted_address" text,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"coords_cached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"types" text[] DEFAULT '{}'::text[] NOT NULL,
	"primary_type" text,
	"viewport" jsonb,
	"google_maps_uri" text,
	"website" text,
	"phone" text,
	"timezone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_google_place_id_unique" UNIQUE("google_place_id")
);
--> statement-breakpoint
CREATE TABLE "trip_destinations" (
	"trip_id" text NOT NULL,
	"destination_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "trip_destinations_trip_id_destination_id_pk" PRIMARY KEY("trip_id","destination_id")
);
--> statement-breakpoint
CREATE TABLE "trip_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"trip_id" text NOT NULL,
	"role" "member_role" DEFAULT 'editor' NOT NULL,
	"email" text,
	"created_by" text NOT NULL,
	"expires_at" timestamp with time zone,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "trip_members" (
	"trip_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" DEFAULT 'editor' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	CONSTRAINT "trip_members_trip_id_user_id_pk" PRIMARY KEY("trip_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "trip_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"kind" "section_kind" NOT NULL,
	"title" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"collapsed" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"kind" "trip_kind" DEFAULT 'plan' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"cover_url" text,
	"cover_credit" text,
	"start_date" date,
	"end_date" date,
	"day_count" integer DEFAULT 3 NOT NULL,
	"visibility" "trip_visibility" DEFAULT 'private' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"home_base_place_id" text,
	"default_travel_mode" "travel_mode" DEFAULT 'drive' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "itinerary_days" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"day_index" integer NOT NULL,
	"date" date,
	"title" text,
	"notes" jsonb,
	"travel_mode" "travel_mode",
	"color" text,
	"start_place_id" text,
	"end_place_id" text,
	"collapsed" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itinerary_items" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"day_id" text NOT NULL,
	"kind" "item_kind" NOT NULL,
	"trip_place_id" text,
	"ref_id" text,
	"text" text,
	"start_time" time,
	"end_time" time,
	"duration_min" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"travel_mode_override" "travel_mode",
	"done" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_legs" (
	"id" text PRIMARY KEY NOT NULL,
	"from_place_id" text NOT NULL,
	"to_place_id" text NOT NULL,
	"mode" "travel_mode" NOT NULL,
	"distance_m" integer,
	"duration_s" integer,
	"polyline" text,
	"unavailable" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_lists" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "list_kind" DEFAULT 'places' NOT NULL,
	"color" text DEFAULT 'coral' NOT NULL,
	"icon" text DEFAULT 'map-pin' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"hidden_on_map" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_places" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"list_id" text,
	"place_id" text NOT NULL,
	"title_override" text,
	"notes" text,
	"cost" numeric(12, 2),
	"currency" text,
	"visited" boolean DEFAULT false NOT NULL,
	"color" text,
	"position" integer DEFAULT 0 NOT NULL,
	"added_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"url" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"is_private" integer DEFAULT 1 NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lodgings" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"place_id" text,
	"name" text NOT NULL,
	"address" text,
	"lat" double precision,
	"lng" double precision,
	"check_in" date NOT NULL,
	"check_out" date NOT NULL,
	"check_in_time" text,
	"check_out_time" text,
	"confirmation_no" text,
	"price" numeric(12, 2),
	"currency" text,
	"booking_url" text,
	"notes" text,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"kind" "reservation_kind" NOT NULL,
	"title" text NOT NULL,
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"timezone" text,
	"place_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmation_no" text,
	"price" numeric(12, 2),
	"currency" text,
	"notes" text,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"user_id" text,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_shares" (
	"expense_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"weight" double precision,
	CONSTRAINT "expense_shares_expense_id_user_id_pk" PRIMARY KEY("expense_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"amount_home" numeric(12, 2),
	"category" "expense_category" DEFAULT 'other' NOT NULL,
	"paid_by" text,
	"occurred_on" date,
	"day_index" integer,
	"trip_place_id" text,
	"ref_type" text,
	"ref_id" text,
	"split_mode" "split_mode" DEFAULT 'equal' NOT NULL,
	"notes" text,
	"receipt_url" text,
	"created_by" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate" double precision NOT NULL,
	"as_of" date NOT NULL,
	CONSTRAINT "fx_rates_base_quote_pk" PRIMARY KEY("base","quote")
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" text NOT NULL,
	"note" text,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"actor_id" text,
	"type" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"summary" text NOT NULL,
	"payload" jsonb,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" text PRIMARY KEY NOT NULL,
	"checklist_id" text NOT NULL,
	"text" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"assigned_to" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklists" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" "checklist_kind" DEFAULT 'custom' NOT NULL,
	"day_index" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"author_id" text,
	"date" date,
	"day_index" integer,
	"trip_place_id" text,
	"title" text,
	"body" jsonb,
	"mood" text,
	"lat" double precision,
	"lng" double precision,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"trip_id" text NOT NULL,
	"url" text NOT NULL,
	"storage_key" text NOT NULL,
	"width" integer,
	"height" integer,
	"taken_at" timestamp with time zone,
	"lat" double precision,
	"lng" double precision,
	"caption" text,
	"position" integer DEFAULT 0 NOT NULL,
	"uploaded_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"user_id" text NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_entity_type_entity_id_user_id_emoji_pk" PRIMARY KEY("entity_type","entity_id","user_id","emoji")
);
--> statement-breakpoint
CREATE TABLE "trip_notes" (
	"trip_id" text PRIMARY KEY NOT NULL,
	"body" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guide_likes" (
	"trip_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_likes_trip_id_user_id_pk" PRIMARY KEY("trip_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "guide_stats" (
	"trip_id" text PRIMARY KEY NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"copies" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "list_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'checklist' NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "trip_copies" (
	"id" text PRIMARY KEY NOT NULL,
	"source_trip_id" text,
	"new_trip_id" text NOT NULL,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_travel_profiles" (
	"user_id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_follower_id_user_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow" ADD CONSTRAINT "follow_followee_id_user_id_fk" FOREIGN KEY ("followee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_requester_id_user_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friendship" ADD CONSTRAINT "friendship_addressee_id_user_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_destinations" ADD CONSTRAINT "trip_destinations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_destinations" ADD CONSTRAINT "trip_destinations_destination_id_destinations_id_fk" FOREIGN KEY ("destination_id") REFERENCES "public"."destinations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_invites" ADD CONSTRAINT "trip_invites_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_invites" ADD CONSTRAINT "trip_invites_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_sections" ADD CONSTRAINT "trip_sections_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_home_base_place_id_places_id_fk" FOREIGN KEY ("home_base_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_start_place_id_places_id_fk" FOREIGN KEY ("start_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_days" ADD CONSTRAINT "itinerary_days_end_place_id_places_id_fk" FOREIGN KEY ("end_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_day_id_itinerary_days_id_fk" FOREIGN KEY ("day_id") REFERENCES "public"."itinerary_days"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itinerary_items" ADD CONSTRAINT "itinerary_items_trip_place_id_trip_places_id_fk" FOREIGN KEY ("trip_place_id") REFERENCES "public"."trip_places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_legs" ADD CONSTRAINT "route_legs_from_place_id_places_id_fk" FOREIGN KEY ("from_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_legs" ADD CONSTRAINT "route_legs_to_place_id_places_id_fk" FOREIGN KEY ("to_place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_lists" ADD CONSTRAINT "trip_lists_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_list_id_trip_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."trip_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_places" ADD CONSTRAINT "trip_places_added_by_user_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodgings" ADD CONSTRAINT "lodgings_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodgings" ADD CONSTRAINT "lodgings_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lodgings" ADD CONSTRAINT "lodgings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_paid_by_user_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_place_id_trip_places_id_fk" FOREIGN KEY ("trip_place_id") REFERENCES "public"."trip_places"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_assigned_to_user_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklists" ADD CONSTRAINT "checklists_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_photos" ADD CONSTRAINT "journal_photos_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_photos" ADD CONSTRAINT "journal_photos_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_photos" ADD CONSTRAINT "journal_photos_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_notes" ADD CONSTRAINT "trip_notes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_likes" ADD CONSTRAINT "guide_likes_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_likes" ADD CONSTRAINT "guide_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guide_stats" ADD CONSTRAINT "guide_stats_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_templates" ADD CONSTRAINT "list_templates_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_copies" ADD CONSTRAINT "trip_copies_source_trip_id_trips_id_fk" FOREIGN KEY ("source_trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_copies" ADD CONSTRAINT "trip_copies_new_trip_id_trips_id_fk" FOREIGN KEY ("new_trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_copies" ADD CONSTRAINT "trip_copies_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_travel_profiles" ADD CONSTRAINT "user_travel_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "follow_followee_follower_idx" ON "follow" USING btree ("followee_id","follower_id");--> statement-breakpoint
CREATE INDEX "friendship_addressee_idx" ON "friendship" USING btree ("addressee_id");--> statement-breakpoint
CREATE INDEX "destinations_search_trgm_idx" ON "destinations" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "destinations_popularity_idx" ON "destinations" USING btree ("popularity");--> statement-breakpoint
CREATE INDEX "destinations_google_place_idx" ON "destinations" USING btree ("google_place_id");--> statement-breakpoint
CREATE INDEX "destinations_parent_idx" ON "destinations" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "places_google_place_id_idx" ON "places" USING btree ("google_place_id");--> statement-breakpoint
CREATE INDEX "trip_destinations_destination_idx" ON "trip_destinations" USING btree ("destination_id");--> statement-breakpoint
CREATE INDEX "trip_invites_trip_idx" ON "trip_invites" USING btree ("trip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_invites_token_idx" ON "trip_invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "trip_members_user_idx" ON "trip_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trip_sections_trip_idx" ON "trip_sections" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trips_owner_idx" ON "trips" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "trips_visibility_idx" ON "trips" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "trips_start_date_idx" ON "trips" USING btree ("start_date");--> statement-breakpoint
CREATE UNIQUE INDEX "itinerary_days_trip_day_idx" ON "itinerary_days" USING btree ("trip_id","day_index");--> statement-breakpoint
CREATE INDEX "itinerary_items_day_idx" ON "itinerary_items" USING btree ("day_id");--> statement-breakpoint
CREATE INDEX "itinerary_items_trip_idx" ON "itinerary_items" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "itinerary_items_trip_place_idx" ON "itinerary_items" USING btree ("trip_place_id");--> statement-breakpoint
CREATE UNIQUE INDEX "route_legs_key_idx" ON "route_legs" USING btree ("from_place_id","to_place_id","mode");--> statement-breakpoint
CREATE INDEX "trip_lists_trip_idx" ON "trip_lists" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_places_trip_idx" ON "trip_places" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_places_list_idx" ON "trip_places" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "trip_places_place_idx" ON "trip_places" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "attachments_trip_idx" ON "attachments" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "attachments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "lodgings_trip_idx" ON "lodgings" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "reservations_trip_idx" ON "reservations" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "reservations_start_idx" ON "reservations" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "budgets_trip_idx" ON "budgets" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "expenses_trip_idx" ON "expenses" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "expenses_occurred_idx" ON "expenses" USING btree ("occurred_on");--> statement-breakpoint
CREATE INDEX "settlements_trip_idx" ON "settlements" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "activities_trip_created_idx" ON "activities" USING btree ("trip_id","created_at");--> statement-breakpoint
CREATE INDEX "checklist_items_checklist_idx" ON "checklist_items" USING btree ("checklist_id");--> statement-breakpoint
CREATE INDEX "checklists_trip_idx" ON "checklists" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "comments_entity_idx" ON "comments" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "comments_trip_idx" ON "comments" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "journal_entries_trip_idx" ON "journal_entries" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "journal_photos_entry_idx" ON "journal_photos" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_photos_trip_idx" ON "journal_photos" USING btree ("trip_id");