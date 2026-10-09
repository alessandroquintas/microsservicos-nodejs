import { InvoiceNotFoundError } from "../../domain/invoice/errors.ts";
import type { InvoiceEntity } from "../../domain/invoice/invoice-entity.ts";
import type { InvoicesRepository } from "../../domain/invoice/invoices-repository.ts";

type MarkInvoiceAsPaidArgs = {
  invoiceId: string;
};

export class MarkInvoiceAsPaidUseCase {
  #invoicesRepository: InvoicesRepository;

  constructor(invoicesRepository: InvoicesRepository) {
    this.#invoicesRepository = invoicesRepository;
  }

  async execute(args: MarkInvoiceAsPaidArgs): Promise<InvoiceEntity> {
    const { invoiceId } = args;
    const invoice = await this.#invoicesRepository.findById(invoiceId);

    if (!invoice) {
      throw new InvoiceNotFoundError(invoiceId);
    }

    invoice.markAsPaid();
    await this.#invoicesRepository.save(invoice);

    return invoice;
  }
}
