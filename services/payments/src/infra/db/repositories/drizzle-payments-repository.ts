import { eq } from "drizzle-orm";
import { PaymentEntity } from "../../../domain/payment/payment-entity.ts";
import type { PaymentsRepository } from "../../../domain/payment/payments-repository.ts";
import { Money } from "../../../domain/shared/money.ts";
import type { DbExecutor } from "../executor.ts";
import { schema } from "../schema/index.ts";

export class DrizzlePaymentsRepository implements PaymentsRepository {
  #db: DbExecutor;

  constructor(db: DbExecutor) {
    this.#db = db;
  }

  async save(payment: PaymentEntity): Promise<void> {
    await this.#db
      .insert(schema.payments)
      .values({
        id: payment.id,
        invoiceId: payment.invoiceId,
        orderId: payment.orderId,
        amount: payment.amount.cents,
        status: payment.status,
        failureReason: payment.failureReason,
        createdAt: payment.createdAt,
      })
      .onConflictDoNothing({ target: schema.payments.invoiceId });
  }

  async findByInvoiceId(invoiceId: string): Promise<PaymentEntity | null> {
    const [row] = await this.#db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.invoiceId, invoiceId))
      .limit(1);

    if (!row) {
      return null;
    }

    return PaymentEntity.restore({
      ...row,
      amount: Money.fromCents(row.amount),
    });
  }
}
