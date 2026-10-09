import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";
import { OutboxInvoiceEventsPublisher } from "../../../src/infra/db/outbox/outbox-invoice-events-publisher.ts";

function validMessage() {
  return {
    invoiceId: randomUUID(),
    orderId: randomUUID(),
    amount: 1050,
    customer: {
      id: randomUUID(),
      name: "John Doe",
      email: "johndoe@example.com",
    },
    dueDate: new Date().toISOString(),
  };
}

const sut = new OutboxInvoiceEventsPublisher(db);

beforeEach(async () => {
  await db.delete(schema.outboxEvents);
});

afterAll(async () => {
  await db.$client.end();
});

describe("OutboxInvoiceEventsPublisher", () => {
  it("stores InvoiceCreated as a pending outbox event", async () => {
    const message = validMessage();

    await sut.publishInvoiceCreated(message);

    const rows = await db.select().from(schema.outboxEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "InvoiceCreated",
      payload: message,
      publishedAt: null,
      attempts: 0,
    });
  });

  it("does not store a message that breaks the contract", async () => {
    await expect(
      sut.publishInvoiceCreated({ ...validMessage(), dueDate: "tomorrow" }),
    ).rejects.toThrow();

    expect(await db.select().from(schema.outboxEvents)).toHaveLength(0);
  });
});
