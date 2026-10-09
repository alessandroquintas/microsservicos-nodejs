import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  OutboxRelay,
  type OutboxBatch,
  type OutboxEvent,
  type OutboxStore,
} from "../src/outbox-relay.ts";

type StoredEvent = OutboxEvent & {
  publishedAt: Date | null;
  lastError: string | null;
};

class FakeOutboxStore implements OutboxStore {
  items: StoredEvent[] = [];
  limits: number[] = [];

  add(type: string, payload: unknown) {
    const event = {
      id: `event-${this.items.length + 1}`,
      type,
      payload,
      attempts: 0,
      publishedAt: null,
      lastError: null,
    };
    this.items.push(event);
    return event;
  }

  async processPending<T>(
    limit: number,
    handler: (batch: OutboxBatch) => Promise<T>,
  ): Promise<T> {
    this.limits.push(limit);

    const pending = this.items
      .filter((event) => event.publishedAt === null)
      .slice(0, limit);

    return handler({
      events: pending.map(({ id, type, payload, attempts }) => ({
        id,
        type,
        payload,
        attempts,
      })),
      markAsPublished: async (event) => {
        const stored = this.#find(event.id);
        stored.publishedAt = new Date();
        stored.attempts = event.attempts + 1;
        stored.lastError = null;
      },
      markAsFailed: async (event, error) => {
        const stored = this.#find(event.id);
        stored.attempts = event.attempts + 1;
        stored.lastError = error;
      },
    });
  }

  #find(id: string): StoredEvent {
    return this.items.find((event) => event.id === id)!;
  }
}

const channel = { publish: vi.fn(), waitForConfirms: vi.fn() };
let store: FakeOutboxStore;
let sut: OutboxRelay;

beforeEach(() => {
  vi.clearAllMocks();
  store = new FakeOutboxStore();
  sut = new OutboxRelay(store, channel, {
    exchange: "events",
    routingKeys: { OrderCreated: "order.created" },
  });
});

describe("OutboxRelay", () => {
  it("publishes pending events and marks them as published", async () => {
    const payload = { orderId: "order-1" };
    store.add("OrderCreated", payload);

    const published = await sut.publishPending();

    expect(published).toBe(1);
    const [exchange, routingKey, content, options] =
      channel.publish.mock.calls[0];
    expect(exchange).toBe("events");
    expect(routingKey).toBe("order.created");
    expect(JSON.parse(content.toString())).toEqual({ data: payload });
    expect(options).toEqual({ persistent: true, messageId: "event-1" });
    expect(store.items[0]).toMatchObject({ attempts: 1, lastError: null });
    expect(store.items[0].publishedAt).not.toBeNull();
  });

  it("asks the store for at most batchSize events", async () => {
    sut = new OutboxRelay(store, channel, {
      exchange: "events",
      routingKeys: { OrderCreated: "order.created" },
      batchSize: 10,
    });

    await sut.publishPending();

    expect(store.limits).toEqual([10]);
  });

  it("does not publish an event twice", async () => {
    store.add("OrderCreated", {});

    await sut.publishPending();
    await sut.publishPending();

    expect(channel.publish).toHaveBeenCalledOnce();
  });

  it("keeps the event pending when the broker does not confirm", async () => {
    channel.waitForConfirms.mockRejectedValueOnce(
      new Error("broker unavailable"),
    );
    store.add("OrderCreated", {});

    const published = await sut.publishPending();

    expect(published).toBe(0);
    expect(store.items[0]).toMatchObject({
      publishedAt: null,
      attempts: 1,
      lastError: "broker unavailable",
    });
  });

  it("publishes the event on a later attempt after a failure", async () => {
    channel.waitForConfirms.mockRejectedValueOnce(
      new Error("broker unavailable"),
    );
    store.add("OrderCreated", {});

    await sut.publishPending();
    const published = await sut.publishPending();

    expect(published).toBe(1);
    expect(store.items[0]).toMatchObject({ attempts: 2, lastError: null });
  });

  it("marks an event without routing key as failed and publishes the others", async () => {
    store.add("Unknown", {});
    store.add("OrderCreated", {});

    const published = await sut.publishPending();

    expect(published).toBe(1);
    expect(store.items[0]).toMatchObject({
      publishedAt: null,
      lastError: 'No routing key configured for event type "Unknown"',
    });
    expect(store.items[1].publishedAt).not.toBeNull();
  });

  it("waits for the running cycle on stop and starts no new cycle", async () => {
    let confirm!: () => void;
    channel.waitForConfirms.mockImplementationOnce(
      () => new Promise<void>((resolve) => (confirm = resolve)),
    );
    store.add("OrderCreated", {});

    sut.start(10);
    await vi.waitFor(() => expect(channel.waitForConfirms).toHaveBeenCalled());

    let stopped = false;
    const stopping = sut.stop().then(() => (stopped = true));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(stopped).toBe(false);

    confirm();
    await stopping;
    expect(stopped).toBe(true);
    expect(store.items[0].publishedAt).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(channel.publish).toHaveBeenCalledOnce();
    expect(store.limits).toHaveLength(1);
  });
});
