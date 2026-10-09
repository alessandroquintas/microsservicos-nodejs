import type { ConsumeMessage } from "amqplib";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderCanceledMessage } from "@microservices/contracts";
import { InvalidMessageError } from "@microservices/messaging";
import {
  InvalidInvoiceStatusTransitionError,
  InvoiceNotFoundError,
} from "../../../src/domain/invoice/errors.ts";
import { createOrderCanceledHandler } from "../../../src/infra/messaging/handlers/order-canceled.handler.ts";

function makeMessage(content: string) {
  return { content: Buffer.from(content) } as unknown as ConsumeMessage;
}

function validMessage(): OrderCanceledMessage {
  return { orderId: randomUUID(), reason: "Card declined" };
}

const cancelInvoice = { execute: vi.fn() };
const sut = createOrderCanceledHandler(cancelInvoice);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handleOrderCanceled", () => {
  it("cancels the invoice of the order", async () => {
    const data = validMessage();

    await sut(makeMessage(JSON.stringify({ data })));

    expect(cancelInvoice.execute).toHaveBeenCalledWith({
      orderId: data.orderId,
    });
  });

  it("throws InvalidMessageError when the message is not valid JSON", async () => {
    await expect(sut(makeMessage("not-json"))).rejects.toBeInstanceOf(
      InvalidMessageError,
    );
    expect(cancelInvoice.execute).not.toHaveBeenCalled();
  });

  it("throws InvalidMessageError when the message does not match the contract", async () => {
    const data = { ...validMessage(), orderId: "not-a-uuid" };

    const promise = sut(makeMessage(JSON.stringify({ data })));

    await expect(promise).rejects.toBeInstanceOf(InvalidMessageError);
    await expect(promise).rejects.toThrow(/orderId/);
    expect(cancelInvoice.execute).not.toHaveBeenCalled();
  });

  it("sends an invalid status transition straight to the DLQ", async () => {
    const error = new InvalidInvoiceStatusTransitionError("paid", "canceled");
    cancelInvoice.execute.mockRejectedValueOnce(error);

    const promise = sut(makeMessage(JSON.stringify({ data: validMessage() })));

    await expect(promise).rejects.toBeInstanceOf(InvalidMessageError);
    await expect(promise).rejects.toMatchObject({ cause: error });
  });

  it("propagates a missing invoice so the message is retried", async () => {
    const error = new InvoiceNotFoundError("for order order-1");
    cancelInvoice.execute.mockRejectedValueOnce(error);

    await expect(
      sut(makeMessage(JSON.stringify({ data: validMessage() }))),
    ).rejects.toBe(error);
  });
});
