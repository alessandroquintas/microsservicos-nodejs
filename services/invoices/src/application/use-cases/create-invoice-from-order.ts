import { InvoiceEntity } from "../../domain/invoices-entity.ts";
import type { InvoicesRepository } from "../../domain/invoices-repository.ts";

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

    const invoice = InvoiceEntity.create({ orderId });

    await this.#invoicesRepository.save(invoice);

    return invoice;
  }
}
