import { z } from "zod";
import { InvoiceStatus } from "../../../domain/invoice/invoice-entity.ts";

export const listInvoicesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(Object.values(InvoiceStatus)).optional(),
  orderId: z.uuid().optional(),
});

export const invoiceParamsSchema = z.object({ id: z.uuid() });

export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type InvoiceParams = z.infer<typeof invoiceParamsSchema>;
