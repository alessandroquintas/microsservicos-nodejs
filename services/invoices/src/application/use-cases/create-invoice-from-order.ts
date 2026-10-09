import {
  InvoiceEntity,
  type InvoiceCustomer,
} from "../../domain/invoice/invoice-entity.ts";
import type { InvoicesRepository } from "../../domain/invoice/invoices-repository.ts";
import { Money } from "../../domain/shared/money.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";

type CreateInvoiceFromOrderUseCaseArgs = {
  orderId: string;
  amountInCents: number;
  customer: InvoiceCustomer;
};

export class CreateInvoiceFromOrderUseCase {
  #invoicesRepository: InvoicesRepository;
  #unitOfWork: UnitOfWork;

  constructor(invoicesRepository: InvoicesRepository, unitOfWork: UnitOfWork) {
    this.#invoicesRepository = invoicesRepository;
    this.#unitOfWork = unitOfWork;
  }

  async execute(args: CreateInvoiceFromOrderUseCaseArgs) {
    const { orderId, amountInCents, customer } = args;

    // A fatura existente já teve o InvoiceCreated gravado na mesma transação
    // em que foi criada: não publica de novo.
    const existing = await this.#invoicesRepository.findByOrderId(orderId);

    if (existing) {
      return existing;
    }

    const invoice = InvoiceEntity.create({
      orderId,
      amount: Money.fromCents(amountInCents),
      customer,
    });

    return this.#unitOfWork.run(async ({ invoices, invoiceEvents }) => {
      await invoices.save(invoice);

      // Numa entrega concorrente do mesmo OrderCreated, o save da outra
      // transação vence pelo unique de order_id e este é ignorado. Nesse caso,
      // devolve a fatura vencedora sem publicar.
      const persisted = await invoices.findByOrderId(orderId);

      if (persisted && persisted.id !== invoice.id) {
        return persisted;
      }

      await invoiceEvents.publishInvoiceCreated({
        invoiceId: invoice.id,
        orderId: invoice.orderId,
        amount: invoice.amount.cents,
        customer: invoice.customer,
        dueDate: invoice.dueDate.toISOString(),
      });

      return invoice;
    });
  }
}
