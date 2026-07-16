/*
images
uuid
hash
width
height
size
storageKey
createdAt
expiresAt
 */

import {bigint, integer, pgEnum, pgTable, text, timestamp, uuid, varchar} from "drizzle-orm/pg-core";

export const imageSourceType = pgEnum("image_source_type", ["chat", "external"]);

export const dbImages = pgTable("images", {
    uuid: uuid("uuid").defaultRandom().primaryKey(),
    hash: varchar("hash", {length: 64}).notNull().unique(), // SHA-256
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    size: bigint("size", {mode: "number"}).notNull(),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", {withTimezone: true, mode: "date"}).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", {withTimezone: true, mode: "date"}).notNull(),
    sourceType: imageSourceType("source_type").notNull(),
})