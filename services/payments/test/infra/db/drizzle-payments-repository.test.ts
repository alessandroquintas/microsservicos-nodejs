import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PaymentEntity } from "../../../src/domain/payment/payment-entity.ts";
import { Money } from "../../../src/domain/shared/money.ts";
import { DrizzlePaymentsRepository } from "../../../src/infra/db/repositories/drizzle-payments-repository.ts";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";

const sut = new DrizzlePaymentsRepository(db);

function props(invoiceId = randomUUID()) {
  return { invoiceId, orderId: randomUUID(), amount: Money.fromCents(1050) };
}

beforeEach(async () => {
  await db.delete(schema.payments);
});

afterAll(async () => {
  await db.$client.end();
});

describe("DrizzlePaymentsRepository", () => {
  it("persists and finds an approved payment by invoice id", async () => {
    const payment = PaymentEntity.approve(props());

    await sut.save(payment);

    expect(await sut.findByInvoiceId(payment.invoiceId)).toEqual(payment);
  });

  it("persists the failure reason", async () => {
    const payment = PaymentEntity.fail(props(), "Card declined");

    await sut.save(payment);

    const [row] = await db.select().from(schema.payments);
    expect(row).toMatchObject({
      id: payment.id,
      status: "failed",
      failureReason: "Card declined",
      amount: 1050,
    });
  });

  it("returns null when there is no payment for the invoice", async () => {
    expect(await sut.findByInvoiceId(randomUUID())).toBeNull();
  });

  it("ignores a second payment for the same invoice", async () => {
    const invoiceId = randomUUID();
    const first = PaymentEntity.approve(props(invoiceId));

    await sut.save(first);
    await sut.save(PaymentEntity.fail(props(invoiceId), "Card declined"));

    const rows = await db.select().from(schema.payments);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
  });
});
