import type { InvoiceEntity } from "../../src/domain/invoice/invoice-entity.ts";
import type { InvoicesRepository } from "../../src/domain/invoice/invoices-repository.ts";

export class InMemoryInvoicesRepository implements InvoicesRepository {
  items: InvoiceEntity[] = [];

  async save(invoice: InvoiceEntity): Promise<void> {
    const index = this.items.findIndex((item) => item.id === invoice.id);

    if (index >= 0) {
      this.items[index] = invoice;
      return;
    }

    if (this.items.some((item) => item.orderId === invoice.orderId)) return;

    this.items.push(invoice);
  }

  async findById(id: string): Promise<InvoiceEntity | null> {
    return this.items.find((invoice) => invoice.id === id) ?? null;
  }

  async findByOrderId(orderId: string): Promise<InvoiceEntity | null> {
    return this.items.find((invoice) => invoice.orderId === orderId) ?? null;
  }
}
