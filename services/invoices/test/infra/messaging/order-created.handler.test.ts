import type { ConsumeMessage } from "amqplib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrderCreatedHandler } from "../../../src/infra/messaging/handlers/order-created.handler.ts";
import { randomUUID } from "node:crypto";
import type { OrderCreatedMessage } from "@microservices/contracts";

function makeMessage(content: string) {
  return { content: Buffer.from(content) } as unknown as ConsumeMessage;
}

function validMessage(): OrderCreatedMessage {
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

const channel = { ack: vi.fn(), nack: vi.fn() };
const createInvoiceFromOrder = { execute: vi.fn() };
const handleOrderCreated = createOrderCreatedHandler(createInvoiceFromOrder);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleOrderCreated", () => {
  it("creates an invoice for the order and acks the message", async () => {
    const data = validMessage();
    const message = makeMessage(JSON.stringify({ data }));

    await handleOrderCreated(message, channel);

    expect(createInvoiceFromOrder.execute).toHaveBeenCalledWith({
      orderId: data.orderId,
    });
    expect(channel.ack).toHaveBeenCalledWith(message);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it("nacks without requeue when the message does not match the contract", async () => {
    const message = makeMessage(JSON.stringify({ data: {} }));

    await handleOrderCreated(message, channel);

    expect(createInvoiceFromOrder.execute).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it("nacks without requeue when the message is not valid JSON", async () => {
    const message = makeMessage("not-json");

    await handleOrderCreated(message, channel);

    expect(createInvoiceFromOrder.execute).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it("nacks without requeue when creating the invoice fails", async () => {
    createInvoiceFromOrder.execute.mockRejectedValueOnce(
      new Error("database is down"),
    );
    const message = makeMessage(JSON.stringify({ data: validMessage() }));

    await handleOrderCreated(message, channel);

    expect(createInvoiceFromOrder.execute).toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(message, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });
});
