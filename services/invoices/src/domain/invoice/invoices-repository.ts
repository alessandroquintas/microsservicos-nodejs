import type { InvoiceEntity } from "./invoice-entity.ts";

export interface InvoicesRepository {
  save(invoice: InvoiceEntity): Promise<void>;
  findById(id: string): Promise<InvoiceEntity | null>;
  findByOrderId(orderId: string): Promise<InvoiceEntity | null>;
}
