import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";
import { OutboxOrderEventsPublisher } from "../../../src/infra/db/outbox/outbox-order-events-publisher.ts";
import { OutboxRelay } from "../../../src/infra/messaging/outbox-relay.ts";

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

const outbox = new OutboxOrderEventsPublisher(db);
const channel = { publish: vi.fn(), waitForConfirms: vi.fn() };
const sut = new OutboxRelay(db, channel);

beforeEach(async () => {
  vi.clearAllMocks();
  await db.delete(schema.outboxEvents);
});

afterAll(async () => {
  await db.$client.end();
});

describe("OutboxRelay", () => {
  it("publishes pending events and marks them as published", async () => {
    const message = validMessage();
    await outbox.publishOrderCreated(message);

    const published = await sut.publishPending();

    expect(published).toBe(1);
    const [exchange, routingKey, content] = channel.publish.mock.calls[0];
    expect(exchange).toBe("events");
    expect(routingKey).toBe("order.created");
    expect(JSON.parse(content.toString())).toEqual({ data: message });

    const [row] = await db.select().from(schema.outboxEvents);
    expect(row.publishedAt).not.toBeNull();
    expect(row.attempts).toBe(1);
  });

  it("does not publish an event twice", async () => {
    await outbox.publishOrderCreated(validMessage());

    await sut.publishPending();
    await sut.publishPending();

    expect(channel.publish).toHaveBeenCalledOnce();
  });

  it("keeps the event pending when the broker does not confirm", async () => {
    channel.waitForConfirms.mockRejectedValueOnce(
      new Error("broker unavailable"),
    );
    await outbox.publishOrderCreated(validMessage());

    const published = await sut.publishPending();

    expect(published).toBe(0);
    const [row] = await db.select().from(schema.outboxEvents);
    expect(row.publishedAt).toBeNull();
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("broker unavailable");
  });

  it("publishes the event on a later attempt after a failure", async () => {
    channel.waitForConfirms.mockRejectedValueOnce(
      new Error("broker unavailable"),
    );
    await outbox.publishOrderCreated(validMessage());

    await sut.publishPending();
    const published = await sut.publishPending();

    expect(published).toBe(1);
    const [row] = await db.select().from(schema.outboxEvents);
    expect(row.publishedAt).not.toBeNull();
    expect(row.attempts).toBe(2);
    expect(row.lastError).toBeNull();
  });

  it("waits for the running cycle on stop and starts no new cycle", async () => {
    let confirm!: () => void;
    channel.waitForConfirms.mockImplementationOnce(
      () => new Promise<void>((resolve) => (confirm = resolve)),
    );
    await outbox.publishOrderCreated(validMessage());

    sut.start(10);
    await vi.waitFor(() => expect(channel.waitForConfirms).toHaveBeenCalled());

    let stopped = false;
    const stopping = sut.stop().then(() => (stopped = true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stopped).toBe(false);

    confirm();
    await stopping;
    expect(stopped).toBe(true);

    const [row] = await db.select().from(schema.outboxEvents);
    expect(row.publishedAt).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(channel.publish).toHaveBeenCalledOnce();
    expect(channel.waitForConfirms).toHaveBeenCalledOnce();
  });
});
