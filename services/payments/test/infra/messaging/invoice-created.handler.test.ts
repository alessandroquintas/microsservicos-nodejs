import type { ConsumeMessage } from "amqplib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInvoiceCreatedHandler } from "../../../src/infra/messaging/handlers/invoice-created.handler.ts";
import { InvalidMessageError } from "@microservices/messaging";
import { randomUUID } from "node:crypto";
import type { InvoiceCreatedMessage } from "@microservices/contracts";

function makeMessage(content: string) {
  return { content: Buffer.from(content) } as unknown as ConsumeMessage;
}

function validMessage(): InvoiceCreatedMessage {
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

const processPayment = { execute: vi.fn() };
const sut = createInvoiceCreatedHandler(processPayment);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleInvoiceCreated", () => {
  it("processes the payment of the invoice", async () => {
    const data = validMessage();

    await sut(makeMessage(JSON.stringify({ data })));

    expect(processPayment.execute).toHaveBeenCalledWith({
      invoiceId: data.invoiceId,
      orderId: data.orderId,
      amountInCents: data.amount,
      customerId: data.customer.id,
    });
  });

  it("throws InvalidMessageError when the message is not valid JSON", async () => {
    await expect(sut(makeMessage("not-json"))).rejects.toBeInstanceOf(
      InvalidMessageError,
    );
    expect(processPayment.execute).not.toHaveBeenCalled();
  });

  it("throws InvalidMessageError when the message does not match the contract", async () => {
    const data = { ...validMessage(), invoiceId: "not-a-uuid" };

    const promise = sut(makeMessage(JSON.stringify({ data })));

    await expect(promise).rejects.toBeInstanceOf(InvalidMessageError);
    await expect(promise).rejects.toThrow(/invoiceId/);
    expect(processPayment.execute).not.toHaveBeenCalled();
  });

  it("propagates the error when processing the payment fails", async () => {
    const error = new Error("database is down");
    processPayment.execute.mockRejectedValueOnce(error);

    await expect(
      sut(makeMessage(JSON.stringify({ data: validMessage() }))),
    ).rejects.toBe(error);
  });
});
