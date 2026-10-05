import { pgTable, pgEnum, text, integer, timestamp } from "drizzle-orm/pg-core";
import { customers } from "./customers.ts";

export const orderStatusEnum = pgEnum("orders_status", [
  "pending",
  "paid",
  "canceled",
]);

export const orders = pgTable("orders", {
  id: text().primaryKey(),
  customerId: text()
    .notNull()
    .references(() => customers.id),
  amount: integer().notNull(),
  status: orderStatusEnum().notNull().default("pending"),
  createdAt: timestamp().defaultNow().notNull(),
});
