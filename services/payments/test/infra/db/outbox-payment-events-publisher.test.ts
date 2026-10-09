import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";
import { OutboxPaymentEventsPublisher } from "../../../src/infra/db/outbox/outbox-payment-events-publisher.ts";

function approvedMessage() {
  return {
    paymentId: randomUUID(),
    invoiceId: randomUUID(),
    orderId: randomUUID(),
    amount: 1050,
  };
}

const sut = new OutboxPaymentEventsPublisher(db);

beforeEach(async () => {
  await db.delete(schema.outboxEvents);
});

afterAll(async () => {
  await db.$client.end();
});

describe("OutboxPaymentEventsPublisher", () => {
  it("stores PaymentApproved as a pending outbox event", async () => {
    const message = approvedMessage();

    await sut.publishPaymentApproved(message);

    const rows = await db.select().from(schema.outboxEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "PaymentApproved",
      payload: message,
      publishedAt: null,
    });
  });

  it("stores PaymentFailed as a pending outbox event", async () => {
    const message = { ...approvedMessage(), reason: "Card declined" };

    await sut.publishPaymentFailed(message);

    const [row] = await db.select().from(schema.outboxEvents);
    expect(row).toMatchObject({ type: "PaymentFailed", payload: message });
  });

  it("does not store a message that breaks the contract", async () => {
    await expect(
      sut.publishPaymentFailed({ ...approvedMessage(), reason: "" }),
    ).rejects.toThrow();

    expect(await db.select().from(schema.outboxEvents)).toHaveLength(0);
  });
});
