import type { ConsumeMessage } from "amqplib";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentApprovedMessage } from "@microservices/contracts";
import { InvalidMessageError } from "@microservices/messaging";
import {
  InvalidOrderStatusTransitionError,
  OrderNotFoundError,
} from "../../../src/domain/order/errors.ts";
import { createPaymentApprovedHandler } from "../../../src/infra/messaging/handlers/payment-approved.handler.ts";

function makeMessage(content: string) {
  return { content: Buffer.from(content) } as unknown as ConsumeMessage;
}

function validMessage(): PaymentApprovedMessage {
  return {
    paymentId: randomUUID(),
    invoiceId: randomUUID(),
    orderId: randomUUID(),
    amount: 1050,
  };
}

const markOrderAsPaid = { execute: vi.fn() };
const sut = createPaymentApprovedHandler(markOrderAsPaid);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlePaymentApproved", () => {
  it("marks the order as paid", async () => {
    const data = validMessage();

    await sut(makeMessage(JSON.stringify({ data })));

    expect(markOrderAsPaid.execute).toHaveBeenCalledWith({
      orderId: data.orderId,
    });
  });

  it("throws InvalidMessageError when the message is not valid JSON", async () => {
    await expect(sut(makeMessage("not-json"))).rejects.toBeInstanceOf(
      InvalidMessageError,
    );
    expect(markOrderAsPaid.execute).not.toHaveBeenCalled();
  });

  it("throws InvalidMessageError when the message does not match the contract", async () => {
    const data = { ...validMessage(), orderId: "not-a-uuid" };

    const promise = sut(makeMessage(JSON.stringify({ data })));

    await expect(promise).rejects.toBeInstanceOf(InvalidMessageError);
    await expect(promise).rejects.toThrow(/orderId/);
    expect(markOrderAsPaid.execute).not.toHaveBeenCalled();
  });

  it.each([
    new OrderNotFoundError("order-1"),
    new InvalidOrderStatusTransitionError("canceled", "paid"),
  ])("sends $name straight to the DLQ", async (error) => {
    markOrderAsPaid.execute.mockRejectedValueOnce(error);

    const promise = sut(makeMessage(JSON.stringify({ data: validMessage() })));

    await expect(promise).rejects.toBeInstanceOf(InvalidMessageError);
    await expect(promise).rejects.toMatchObject({ cause: error });
  });

  it("propagates other errors so the message is retried", async () => {
    const error = new Error("database is down");
    markOrderAsPaid.execute.mockRejectedValueOnce(error);

    await expect(
      sut(makeMessage(JSON.stringify({ data: validMessage() }))),
    ).rejects.toBe(error);
  });
});
