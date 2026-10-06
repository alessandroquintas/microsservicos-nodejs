import { InvoiceEntity } from "../../domain/invoice/invoice-entity.ts";
import type { InvoicesRepository } from "../../domain/invoice/invoices-repository.ts";

type CreateInvoiceFromOrderUseCaseArgs = {
  orderId: string;
};

export class CreateInvoiceFromOrderUseCase {
  #invoicesRepository: InvoicesRepository;

  constructor(invoicesRepository: InvoicesRepository) {
    this.#invoicesRepository = invoicesRepository;
  }

  async execute(args: CreateInvoiceFromOrderUseCaseArgs) {
    const { orderId } = args;

    const existing = await this.#invoicesRepository.findByOrderId(orderId);

    if (existing) {
      return existing;
    }

    const invoice = InvoiceEntity.create({ orderId });

    await this.#invoicesRepository.save(invoice);

    return invoice;
  }
}
