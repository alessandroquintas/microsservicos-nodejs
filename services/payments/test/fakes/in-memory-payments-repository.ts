import type { PaymentEntity } from "../../src/domain/payment/payment-entity.ts";
import type { PaymentsRepository } from "../../src/domain/payment/payments-repository.ts";

export class InMemoryPaymentsRepository implements PaymentsRepository {
  items: PaymentEntity[] = [];

  async save(payment: PaymentEntity): Promise<void> {
    if (this.items.some((item) => item.invoiceId === payment.invoiceId)) return;

    this.items.push(payment);
  }

  async findByInvoiceId(invoiceId: string): Promise<PaymentEntity | null> {
    return (
      this.items.find((payment) => payment.invoiceId === invoiceId) ?? null
    );
  }
}
