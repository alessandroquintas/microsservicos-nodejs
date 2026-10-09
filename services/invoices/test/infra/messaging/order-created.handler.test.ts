import type { ConsumeMessage } from "amqplib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createOrderCreatedHandler } from "../../../src/infra/messaging/handlers/order-created.handler.ts";
import { InvalidMessageError } from "@microservices/messaging";
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

const createInvoiceFromOrder = { execute: vi.fn() };
const sut = createOrderCreatedHandler(createInvoiceFromOrder);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleOrderCreated", () => {
  it("creates an invoice with the order amount and customer", async () => {
    const data = validMessage();

    await sut(makeMessage(JSON.stringify({ data })));

    expect(createInvoiceFromOrder.execute).toHaveBeenCalledWith({
      orderId: data.orderId,
      amountInCents: data.amount,
      customer: data.customer,
    });
  });

  it("throws InvalidMessageError when the message is not valid JSON", async () => {
    await expect(sut(makeMessage("not-json"))).rejects.toBeInstanceOf(
      InvalidMessageError,
    );
    expect(createInvoiceFromOrder.execute).not.toHaveBeenCalled();
  });

  it("throws InvalidMessageError when the message does not match the contract", async () => {
    const data = { ...validMessage(), orderId: "not-a-uuid" };

    const promise = sut(makeMessage(JSON.stringify({ data })));

    await expect(promise).rejects.toBeInstanceOf(InvalidMessageError);
    await expect(promise).rejects.toThrow(/orderId/);
    expect(createInvoiceFromOrder.execute).not.toHaveBeenCalled();
  });

  it("propagates the error when creating the invoice fails", async () => {
    const error = new Error("database is down");
    createInvoiceFromOrder.execute.mockRejectedValueOnce(error);

    await expect(
      sut(makeMessage(JSON.stringify({ data: validMessage() }))),
    ).rejects.toBe(error);
  });
});
