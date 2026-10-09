import type {
  InvoicesQuery,
  InvoiceView,
  ListInvoicesFilters,
  Page,
} from "../../src/application/queries/invoices-query.ts";

export class FakeInvoicesQuery implements InvoicesQuery {
  items: InvoiceView[] = [];

  async findById(id: string): Promise<InvoiceView | null> {
    return this.items.find((invoice) => invoice.id === id) ?? null;
  }

  async list(filters: ListInvoicesFilters): Promise<Page<InvoiceView>> {
    const { page, pageSize, status, orderId } = filters;

    const matching = this.items
      .filter((invoice) => !status || invoice.status === status)
      .filter((invoice) => !orderId || invoice.orderId === orderId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const start = (page - 1) * pageSize;

    return {
      items: matching.slice(start, start + pageSize),
      page,
      pageSize,
      total: matching.length,
    };
  }
}
