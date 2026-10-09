import { InvoiceNotFoundError } from "../../domain/invoice/errors.ts";
import type { InvoicesQuery, InvoiceView } from "../queries/invoices-query.ts";

type GetInvoiceArgs = {
  invoiceId: string;
};

export class GetInvoiceUseCase {
  #invoicesQuery: InvoicesQuery;

  constructor(invoicesQuery: InvoicesQuery) {
    this.#invoicesQuery = invoicesQuery;
  }

  async execute(args: GetInvoiceArgs): Promise<InvoiceView> {
    const { invoiceId } = args;
    const invoice = await this.#invoicesQuery.findById(invoiceId);

    if (!invoice) {
      throw new InvoiceNotFoundError(invoiceId);
    }

    return invoice;
  }
}
