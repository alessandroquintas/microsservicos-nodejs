import { integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "open",
  "paid",
  "canceled",
]);

export const invoices = pgTable("invoices", {
  id: text().primaryKey(),
  orderId: text().notNull().unique(),
  amount: integer().notNull(),
  status: invoiceStatusEnum().notNull(),
  customerId: text().notNull(),
  customerName: text().notNull(),
  customerEmail: text().notNull(),
  dueDate: timestamp().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});
