import type { PaymentEntity } from "./payment-entity.ts";

export interface PaymentsRepository {
  save(payment: PaymentEntity): Promise<void>;
  findByInvoiceId(invoiceId: string): Promise<PaymentEntity | null>;
}
