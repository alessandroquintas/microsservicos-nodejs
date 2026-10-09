import { z } from "zod";
import { InvoiceStatus } from "../../../domain/invoice/invoice-entity.ts";

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(Object.values(InvoiceStatus)).optional(),
  orderId: z.uuid().optional(),
});

export const invoiceParamsSchema = z.object({ id: z.uuid() });

export const invoiceResponseSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  amount: z.number().int().describe("Valor em centavos"),
  status: z.enum(Object.values(InvoiceStatus)),
  customer: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
  dueDate: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export const invoicesPageResponseSchema = z.object({
  items: z.array(invoiceResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type InvoiceParams = z.infer<typeof invoiceParamsSchema>;
