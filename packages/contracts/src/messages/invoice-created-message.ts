import { z } from "zod";

export const invoiceCreatedMessageSchema = z.object({
  invoiceId: z.uuid(),
  orderId: z.uuid(),
  amount: z.number().int().positive(),
  customer: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    email: z.email(),
  }),
  dueDate: z.iso.datetime(),
});

export type InvoiceCreatedMessage = z.infer<typeof invoiceCreatedMessageSchema>;

export const INVOICE_CREATED_EVENT = "InvoiceCreated";

export const INVOICE_CREATED_ROUTING_KEY = "invoice.created";
