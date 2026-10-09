import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";
import { OutboxOrderEventsPublisher } from "../../../src/infra/db/outbox/outbox-order-events-publisher.ts";

function validMessage() {
  return {
    orderId: randomUUID(),
    amount: 100,
    customer: {
      id: randomUUID(),
      name: "John Doe",
      email: "johndoe@example.com",
    },
  };
}

const sut = new OutboxOrderEventsPublisher(db);

beforeEach(async () => {
  await db.delete(schema.outboxEvents);
});

afterAll(async () => {
  await db.$client.end();
});

describe("OutboxOrderEventsPublisher", () => {
  it("stores OrderCreated as a pending outbox event", async () => {
    const message = validMessage();

    await sut.publishOrderCreated(message);

    const rows = await db.select().from(schema.outboxEvents);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "OrderCreated",
      payload: message,
      publishedAt: null,
      attempts: 0,
    });
  });

  it("does not store a message that breaks the contract", async () => {
    await expect(
      sut.publishOrderCreated({ ...validMessage(), amount: -1 }),
    ).rejects.toThrow();

    expect(await db.select().from(schema.outboxEvents)).toHaveLength(0);
  });

  it("stores OrderCanceled as a pending outbox event", async () => {
    const message = { orderId: randomUUID(), reason: "Card declined" };

    await sut.publishOrderCanceled(message);

    const [row] = await db.select().from(schema.outboxEvents);
    expect(row).toMatchObject({
      type: "OrderCanceled",
      payload: message,
      publishedAt: null,
    });
  });

  it("does not store an OrderCanceled that breaks the contract", async () => {
    await expect(
      sut.publishOrderCanceled({ orderId: "not-a-uuid", reason: "x" }),
    ).rejects.toThrow();

    expect(await db.select().from(schema.outboxEvents)).toHaveLength(0);
  });
});
