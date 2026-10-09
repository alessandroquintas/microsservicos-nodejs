import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";
import { DrizzleUnitOfWork } from "../../../src/infra/db/drizzle-unit-of-work.ts";
import { PaymentEntity } from "../../../src/domain/payment/payment-entity.ts";
import { Money } from "../../../src/domain/shared/money.ts";

const sut = new DrizzleUnitOfWork(db);

function makePayment() {
  return PaymentEntity.approve({
    invoiceId: randomUUID(),
    orderId: randomUUID(),
    amount: Money.fromCents(1050),
  });
}

function messageFor(payment: PaymentEntity) {
  return {
    paymentId: payment.id,
    invoiceId: payment.invoiceId,
    orderId: payment.orderId,
    amount: payment.amount.cents,
  };
}

beforeEach(async () => {
  await db.delete(schema.outboxEvents);
  await db.delete(schema.payments);
});

afterAll(async () => {
  await db.$client.end();
});

describe("DrizzleUnitOfWork", () => {
  it("commits the payment and the event together", async () => {
    const payment = makePayment();

    await sut.run(async ({ payments, paymentEvents }) => {
      await payments.save(payment);
      await paymentEvents.publishPaymentApproved(messageFor(payment));
    });

    expect(await db.select().from(schema.payments)).toHaveLength(1);
    expect(await db.select().from(schema.outboxEvents)).toHaveLength(1);
  });

  it("rolls back the payment when storing the event fails", async () => {
    const payment = makePayment();

    await expect(
      sut.run(async ({ payments, paymentEvents }) => {
        await payments.save(payment);
        await paymentEvents.publishPaymentApproved({
          ...messageFor(payment),
          amount: -1,
        });
      }),
    ).rejects.toThrow();

    expect(await db.select().from(schema.payments)).toHaveLength(0);
    expect(await db.select().from(schema.outboxEvents)).toHaveLength(0);
  });
});
