CREATE TYPE "public"."image_source_type" AS ENUM('chat', 'external');--> statement-breakpoint
CREATE TABLE "images" (
	"uuid" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hash" varchar(64) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"size" bigint NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"source_type" "image_source_type" NOT NULL,
	CONSTRAINT "images_hash_unique" UNIQUE("hash")
);
