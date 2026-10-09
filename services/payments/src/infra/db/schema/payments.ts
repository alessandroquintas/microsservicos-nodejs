import { integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const paymentStatusEnum = pgEnum("payment_status", [
  "approved",
  "failed",
]);

export const payments = pgTable("payments", {
  id: text().primaryKey(),
  invoiceId: text().notNull().unique(),
  orderId: text().notNull(),
  amount: integer().notNull(),
  status: paymentStatusEnum().notNull(),
  failureReason: text(),
  createdAt: timestamp().defaultNow().notNull(),
});
