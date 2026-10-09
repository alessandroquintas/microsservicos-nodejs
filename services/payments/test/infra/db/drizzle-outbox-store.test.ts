import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { OutboxRelay } from "@microservices/messaging";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";
import { OutboxPaymentEventsPublisher } from "../../../src/infra/db/outbox/outbox-payment-events-publisher.ts";
import { DrizzleOutboxStore } from "../../../src/infra/db/outbox/drizzle-outbox-store.ts";
import { ROUTING_KEY_BY_EVENT_TYPE } from "../../../src/infra/messaging/routing-keys.ts";

function validMessage() {
  return {
    paymentId: randomUUID(),
    invoiceId: randomUUID(),
    orderId: randomUUID(),
    amount: 1050,
  };
}

const outbox = new OutboxPaymentEventsPublisher(db);
const sut = new DrizzleOutboxStore(db);

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(schema.outboxEvents);
});

afterAll(async () => {
  await db.$client.end();
});

describe("DrizzleOutboxStore", () => {
  it("hands the pending events to the handler, oldest first", async () => {
    const first = validMessage();
    const second = validMessage();
    await outbox.publishPaymentApproved(first);
    await outbox.publishPaymentApproved(second);

    const events = await sut.processPending(10, async (batch) => batch.events);

    expect(events).toEqual([
      {
        id: expect.any(String),
        type: "PaymentApproved",
        payload: first,
        attempts: 0,
      },
      {
        id: expect.any(String),
        type: "PaymentApproved",
        payload: second,
        attempts: 0,
      },
    ]);
  });

  it("returns at most limit events", async () => {
    await outbox.publishPaymentApproved(validMessage());
    await outbox.publishPaymentApproved(validMessage());

    const events = await sut.processPending(1, async (batch) => batch.events);

    expect(events).toHaveLength(1);
  });

  it("marks an event as published", async () => {
    await outbox.publishPaymentApproved(validMessage());

    await sut.processPending(10, async (batch) => {
      await batch.markAsPublished(batch.events[0]);
    });

    const [row] = await db.select().from(schema.outboxEvents);
    expect(row.publishedAt).not.toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBeNull();
    expect(await sut.processPending(10, async (batch) => batch.events)).toEqual(
      [],
    );
  });

  it("marks an event as failed and keeps it pending", async () => {
    await outbox.publishPaymentApproved(validMessage());

    await sut.processPending(10, async (batch) => {
      await batch.markAsFailed(batch.events[0], "broker unavailable");
    });

    const [row] = await db.select().from(schema.outboxEvents);
    expect(row.publishedAt).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("broker unavailable");
  });

  it("rolls back the marks when the handler fails", async () => {
    await outbox.publishPaymentApproved(validMessage());

    await expect(
      sut.processPending(10, async (batch) => {
        await batch.markAsPublished(batch.events[0]);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const [row] = await db.select().from(schema.outboxEvents);
    expect(row.publishedAt).toBeNull();
  });

  it("skips events locked by another relay", async () => {
    await outbox.publishPaymentApproved(validMessage());

    const inner = await sut.processPending(10, async () =>
      sut.processPending(10, async (batch) => batch.events),
    );

    expect(inner).toEqual([]);
  });

  it("works with the OutboxRelay", async () => {
    const channel = { publish: vi.fn(), waitForConfirms: vi.fn() };
    const relay = new OutboxRelay(sut, channel, {
      exchange: "events",
      routingKeys: ROUTING_KEY_BY_EVENT_TYPE,
    });
    const message = validMessage();
    await outbox.publishPaymentApproved(message);

    const published = await relay.publishPending();

    expect(published).toBe(1);
    const [exchange, routingKey, content] = channel.publish.mock.calls[0];
    expect(exchange).toBe("events");
    expect(routingKey).toBe("payment.approved");
    expect(JSON.parse(content.toString())).toEqual({ data: message });

    const [row] = await db.select().from(schema.outboxEvents);
    expect(row.publishedAt).not.toBeNull();
  });
});
