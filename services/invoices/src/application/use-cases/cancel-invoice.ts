import { InvoiceNotFoundError } from "../../domain/invoice/errors.ts";
import type { InvoiceEntity } from "../../domain/invoice/invoice-entity.ts";
import type { InvoicesRepository } from "../../domain/invoice/invoices-repository.ts";

type CancelInvoiceArgs = {
  orderId: string;
};

export class CancelInvoiceUseCase {
  #invoicesRepository: InvoicesRepository;

  constructor(invoicesRepository: InvoicesRepository) {
    this.#invoicesRepository = invoicesRepository;
  }

  async execute(args: CancelInvoiceArgs): Promise<InvoiceEntity> {
    const { orderId } = args;
    const invoice = await this.#invoicesRepository.findByOrderId(orderId);

    // O OrderCanceled pode chegar antes de o OrderCreated ser processado. Quem
    // chama trata este erro como temporário e tenta de novo mais tarde.
    if (!invoice) {
      throw new InvoiceNotFoundError(`for order ${orderId}`);
    }

    invoice.cancel();
    await this.#invoicesRepository.save(invoice);

    return invoice;
  }
}
