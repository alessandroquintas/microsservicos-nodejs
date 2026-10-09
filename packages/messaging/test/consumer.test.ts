import type { ConsumeMessage } from "amqplib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  startConsumer,
  type Consumer,
} from "../src/consumer.ts";
import { InvalidMessageError } from "../src/errors.ts";

const QUEUE = "invoices.order-created";
const DLQ = "invoices.order-created.dlq";

type OnMessage = (message: ConsumeMessage | null) => void;

function makeChannel() {
  let onMessage: OnMessage | undefined;

  const channel = {
    consume: vi.fn(async (_queue: string, callback: OnMessage) => {
      onMessage = callback;
      return { consumerTag: "consumer-tag" };
    }),
    ack: vi.fn(),
    nack: vi.fn(),
    sendToQueue: vi.fn(),
    cancel: vi.fn(),
  };

  return {
    channel,
    deliver: async (message: ConsumeMessage | null) => {
      onMessage!(message);
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

function makeMessage(headers: Record<string, unknown> = {}) {
  return {
    content: Buffer.from("{}"),
    properties: { messageId: "message-id", headers },
  } as unknown as ConsumeMessage;
}

function rejectedTimes(count: number) {
  return {
    "x-death": [
      { queue: "invoices.order-created.retry", reason: "expired", count },
      { queue: QUEUE, reason: "rejected", count },
    ],
  };
}

const handler = vi.fn();
let channel: ReturnType<typeof makeChannel>["channel"];
let deliver: ReturnType<typeof makeChannel>["deliver"];
let sut: Consumer;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  ({ channel, deliver } = makeChannel());

  sut = await startConsumer(
    channel,
    { queue: QUEUE, deadLetterQueue: DLQ, maxRetries: 3 },
    handler,
  );
});

describe("startConsumer", () => {
  it("consumes the main queue", () => {
    expect(channel.consume).toHaveBeenCalledWith(
      QUEUE,
      expect.any(Function),
      { noAck: false },
    );
  });

  it("acks the message when the handler succeeds", async () => {
    const message = makeMessage();

    await deliver(message);

    expect(handler).toHaveBeenCalledWith(message);
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it("nacks without requeue on a failure without x-death", async () => {
    handler.mockRejectedValueOnce(new Error("database is down"));
    const message = makeMessage();

    await deliver(message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it("nacks without requeue when the message was retried 2 times", async () => {
    handler.mockRejectedValueOnce(new Error("database is down"));
    const message = makeMessage(rejectedTimes(2));

    await deliver(message);

    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });

  it("sends to the DLQ and acks when the message was retried 3 times", async () => {
    handler.mockRejectedValueOnce(new Error("database is down"));
    const message = makeMessage(rejectedTimes(3));

    await deliver(message);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      DLQ,
      message.content,
      expect.objectContaining({ persistent: true, messageId: "message-id" }),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it("sends to the DLQ and acks immediately on InvalidMessageError", async () => {
    handler.mockRejectedValueOnce(new InvalidMessageError("invalid"));
    const message = makeMessage();

    await deliver(message);

    expect(channel.sendToQueue).toHaveBeenCalledWith(
      DLQ,
      message.content,
      expect.anything(),
    );
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it("includes the original headers and x-last-error in the DLQ message", async () => {
    handler.mockRejectedValueOnce(new Error("database is down"));
    const headers = { ...rejectedTimes(3), "x-custom": "value" };

    await deliver(makeMessage(headers));

    const [, , options] = channel.sendToQueue.mock.calls[0];
    expect(options.headers).toEqual({
      ...headers,
      "x-last-error": "database is down",
    });
  });

  it("ignores a null message", async () => {
    await deliver(null);

    expect(handler).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it("stop cancels the consumer and waits for in-flight messages", async () => {
    let finish!: () => void;
    handler.mockImplementationOnce(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    const message = makeMessage();
    await deliver(message);

    let stopped = false;
    const stopping = sut.stop().then(() => (stopped = true));
    await new Promise((resolve) => setImmediate(resolve));

    expect(channel.cancel).toHaveBeenCalledWith("consumer-tag");
    expect(stopped).toBe(false);

    finish();
    await stopping;

    expect(stopped).toBe(true);
    expect(channel.ack).toHaveBeenCalledWith(message);
  });
});
