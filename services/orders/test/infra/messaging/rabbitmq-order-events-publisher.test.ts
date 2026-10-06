import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { RabbitMQOrderEventsPublisher } from "../../../src/infra/messaging/publisher/rabbitmq-order-events-publisher.ts";

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

describe("RabbitMQOrderEventsPublisher", () => {
  it("sends OrderCreated to the orders queue wrapped in data", async () => {
    const channel = { sendToQueue: vi.fn() };
    const sut = new RabbitMQOrderEventsPublisher(channel);
    const message = validMessage();

    await sut.publishOrderCreated(message);

    expect(channel.sendToQueue).toHaveBeenCalledOnce();
    const [queue, content] = channel.sendToQueue.mock.calls[0];
    expect(queue).toBe("orders-queue");
    expect(JSON.parse(content.toString())).toEqual({ data: message });
  });

  it("does not send a message that breaks the contract", async () => {
    const channel = { sendToQueue: vi.fn() };
    const sut = new RabbitMQOrderEventsPublisher(channel);

    await expect(
      sut.publishOrderCreated({ ...validMessage(), amount: -1 }),
    ).rejects.toThrow();

    expect(channel.sendToQueue).not.toHaveBeenCalled();
  });
});
