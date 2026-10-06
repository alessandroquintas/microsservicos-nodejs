import type { InvoiceEntity } from "../../src/domain/invoice/invoice-entity.ts";
import type { InvoicesRepository } from "../../src/domain/invoice/invoices-repository.ts";

export class InMemoryInvoicesRepository implements InvoicesRepository {
  items: InvoiceEntity[] = [];

  async save(invoice: InvoiceEntity): Promise<void> {
    this.items.push(invoice);
  }

  async findByOrderId(orderId: string): Promise<InvoiceEntity | null> {
    return this.items.find((invoice) => invoice.orderId === orderId) ?? null;
  }
}
