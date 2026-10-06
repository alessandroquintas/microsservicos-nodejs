import type { InvoiceEntity } from "./invoice-entity.ts";

export interface InvoicesRepository {
  save(invoice: InvoiceEntity): Promise<void>;
  findByOrderId(orderId: string): Promise<InvoiceEntity | null>;
}
