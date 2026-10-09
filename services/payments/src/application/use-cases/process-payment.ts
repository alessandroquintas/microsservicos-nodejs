import { PaymentEntity } from "../../domain/payment/payment-entity.ts";
import type { PaymentsRepository } from "../../domain/payment/payments-repository.ts";
import { Money } from "../../domain/shared/money.ts";
import type { PaymentGateway } from "../ports/payment-gateway.ts";
import type { UnitOfWork } from "../ports/unit-of-work.ts";

type ProcessPaymentArgs = {
  invoiceId: string;
  orderId: string;
  amountInCents: number;
  customerId: string;
};

export class ProcessPaymentUseCase {
  #paymentsRepository: PaymentsRepository;
  #paymentGateway: PaymentGateway;
  #unitOfWork: UnitOfWork;

  constructor(
    paymentsRepository: PaymentsRepository,
    paymentGateway: PaymentGateway,
    unitOfWork: UnitOfWork,
  ) {
    this.#paymentsRepository = paymentsRepository;
    this.#paymentGateway = paymentGateway;
    this.#unitOfWork = unitOfWork;
  }

  async execute(args: ProcessPaymentArgs): Promise<PaymentEntity> {
    const { invoiceId, orderId, amountInCents, customerId } = args;

    // O evento do pagamento existente foi gravado na mesma transação em que
    // ele foi criado: não cobra nem publica de novo.
    const existing = await this.#paymentsRepository.findByInvoiceId(invoiceId);

    if (existing) {
      return existing;
    }

    const amount = Money.fromCents(amountInCents);
    const result = await this.#paymentGateway.charge({
      amountInCents,
      customerId,
    });

    const payment = result.approved
      ? PaymentEntity.approve({ invoiceId, orderId, amount })
      : PaymentEntity.fail({ invoiceId, orderId, amount }, result.reason);

    return this.#unitOfWork.run(async ({ payments, paymentEvents }) => {
      await payments.save(payment);

      // Numa entrega concorrente do mesmo InvoiceCreated, o pagamento da outra
      // transação vence pelo unique de invoice_id e este é ignorado.
      const persisted = await payments.findByInvoiceId(invoiceId);

      if (persisted && persisted.id !== payment.id) {
        return persisted;
      }

      const message = {
        paymentId: payment.id,
        invoiceId,
        orderId,
        amount: payment.amount.cents,
      };

      if (result.approved) {
        await paymentEvents.publishPaymentApproved(message);
      } else {
        await paymentEvents.publishPaymentFailed({
          ...message,
          reason: result.reason,
        });
      }

      return payment;
    });
  }
}
