import type { InvoiceEntity } from "../../src/domain/invoices-entity.ts";
import type { InvoicesRepository } from "../../src/domain/invoices-repository.ts";

export class InMemoryInvoicesRepository implements InvoicesRepository {
  items: InvoiceEntity[] = [];

  async save(invoice: InvoiceEntity): Promise<void> {
    this.items.push(invoice);
  }
}
