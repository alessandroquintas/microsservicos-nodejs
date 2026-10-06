import type { InvoiceEntity } from "./invoice-entity.ts";

export interface InvoicesRepository {
  save(invoice: InvoiceEntity): Promise<void>;
}
