import type { ConsumeMessage } from "amqplib";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentFailedMessage } from "@microservices/contracts";
import { InvalidMessageError } from "@microservices/messaging";
import {
  InvalidOrderStatusTransitionError,
  OrderNotFoundError,
} from "../../../src/domain/order/errors.ts";
import { createPaymentFailedHandler } from "../../../src/infra/messaging/handlers/payment-failed.handler.ts";

function makeMessage(content: string) {
  return { content: Buffer.from(content) } as unknown as ConsumeMessage;
}

function validMessage(): PaymentFailedMessage {
  return {
    paymentId: randomUUID(),
    invoiceId: randomUUID(),
    orderId: randomUUID(),
    amount: 1050,
    reason: "Card declined",
  };
}

const cancelOrder = { execute: vi.fn() };
const sut = createPaymentFailedHandler(cancelOrder);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlePaymentFailed", () => {
  it("cancels the order with the failure reason", async () => {
    const data = validMessage();

    await sut(makeMessage(JSON.stringify({ data })));

    expect(cancelOrder.execute).toHaveBeenCalledWith({
      orderId: data.orderId,
      reason: "Card declined",
    });
  });

  it("throws InvalidMessageError when the message is not valid JSON", async () => {
    await expect(sut(makeMessage("not-json"))).rejects.toBeInstanceOf(
      InvalidMessageError,
    );
    expect(cancelOrder.execute).not.toHaveBeenCalled();
  });

  it("throws InvalidMessageError when the message does not match the contract", async () => {
    const data = { ...validMessage(), reason: "" };

    const promise = sut(makeMessage(JSON.stringify({ data })));

    await expect(promise).rejects.toBeInstanceOf(InvalidMessageError);
    await expect(promise).rejects.toThrow(/reason/);
    expect(cancelOrder.execute).not.toHaveBeenCalled();
  });

  it.each([
    new OrderNotFoundError("order-1"),
    new InvalidOrderStatusTransitionError("paid", "canceled"),
  ])("sends $name straight to the DLQ", async (error) => {
    cancelOrder.execute.mockRejectedValueOnce(error);

    const promise = sut(makeMessage(JSON.stringify({ data: validMessage() })));

    await expect(promise).rejects.toBeInstanceOf(InvalidMessageError);
    await expect(promise).rejects.toMatchObject({ cause: error });
  });

  it("propagates other errors so the message is retried", async () => {
    const error = new Error("database is down");
    cancelOrder.execute.mockRejectedValueOnce(error);

    await expect(
      sut(makeMessage(JSON.stringify({ data: validMessage() }))),
    ).rejects.toBe(error);
  });
});
