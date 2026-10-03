import type { InvoiceEntity } from "./invoices-entity.ts";

export interface InvoicesRepository {
  save(invoice: InvoiceEntity): Promise<void>;
}
