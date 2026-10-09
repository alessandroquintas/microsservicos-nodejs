import {
  jsonb,
  pgTable,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: text().primaryKey(),
    type: text().notNull(),
    payload: jsonb().notNull(),
    createdAt: timestamp().defaultNow().notNull(),
    publishedAt: timestamp(),
    attempts: integer().notNull().default(0),
    lastError: text(),
  },
  (table) => [
    index("outbox_events_unpublished_idx").on(
      table.publishedAt,
      table.createdAt,
    ),
  ],
);
