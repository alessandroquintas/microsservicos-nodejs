import type {
  InvoicesQuery,
  InvoiceView,
  ListInvoicesFilters,
  Page,
} from "../queries/invoices-query.ts";

type ListInvoicesArgs = ListInvoicesFilters;

export class ListInvoicesUseCase {
  #invoicesQuery: InvoicesQuery;

  constructor(invoicesQuery: InvoicesQuery) {
    this.#invoicesQuery = invoicesQuery;
  }

  async execute(args: ListInvoicesArgs): Promise<Page<InvoiceView>> {
    return this.#invoicesQuery.list(args);
  }
}
