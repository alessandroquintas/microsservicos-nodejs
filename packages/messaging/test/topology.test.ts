import { beforeEach, describe, expect, it, vi } from "vitest";
import { declareConsumerQueues } from "../src/topology.ts";

const channel = {
  assertExchange: vi.fn(),
  assertQueue: vi.fn(),
  bindQueue: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("declareConsumerQueues", () => {
  it("declares the topic exchange", async () => {
    await declareConsumerQueues(channel, {
      exchange: "events",
      queue: "invoices.order-created",
      routingKeys: ["order.created"],
      retryDelayMs: 5000,
    });

    expect(channel.assertExchange).toHaveBeenCalledWith("events", "topic", {
      durable: true,
    });
  });

  it("declares the main, retry and dead letter queues with dead-lettering", async () => {
    await declareConsumerQueues(channel, {
      exchange: "events",
      queue: "invoices.order-created",
      routingKeys: ["order.created"],
      retryDelayMs: 5000,
    });

    expect(channel.assertQueue).toHaveBeenCalledWith("invoices.order-created", {
      durable: true,
      deadLetterExchange: "",
      deadLetterRoutingKey: "invoices.order-created.retry",
    });
    expect(channel.assertQueue).toHaveBeenCalledWith(
      "invoices.order-created.retry",
      {
        durable: true,
        messageTtl: 5000,
        deadLetterExchange: "",
        deadLetterRoutingKey: "invoices.order-created",
      },
    );
    expect(channel.assertQueue).toHaveBeenCalledWith(
      "invoices.order-created.dlq",
      { durable: true },
    );
  });

  it("binds the main queue to each routing key", async () => {
    await declareConsumerQueues(channel, {
      exchange: "events",
      queue: "audit.all",
      routingKeys: ["order.created", "order.canceled"],
      retryDelayMs: 1000,
    });

    expect(channel.bindQueue.mock.calls).toEqual([
      ["audit.all", "events", "order.created"],
      ["audit.all", "events", "order.canceled"],
    ]);
  });

  it("returns the queue names", async () => {
    const queues = await declareConsumerQueues(channel, {
      exchange: "events",
      queue: "invoices.order-created",
      routingKeys: ["order.created"],
      retryDelayMs: 5000,
    });

    expect(queues).toEqual({
      queue: "invoices.order-created",
      retryQueue: "invoices.order-created.retry",
      deadLetterQueue: "invoices.order-created.dlq",
    });
  });
});
