import { describe, expect, it } from "vitest";
import {
  PaymentEntity,
  PaymentStatus,
} from "../../src/domain/payment/payment-entity.ts";
import {
  InvalidFailureReasonError,
  InvalidInvoiceIdError,
  InvalidPaymentAmountError,
} from "../../src/domain/payment/errors.ts";
import { Money } from "../../src/domain/shared/money.ts";

function props() {
  return {
    invoiceId: "invoice-1",
    orderId: "order-1",
    amount: Money.fromCents(1050),
  };
}

describe("PaymentEntity", () => {
  it("creates an approved payment", () => {
    const payment = PaymentEntity.approve(props());

    expect(payment.id).toEqual(expect.any(String));
    expect(payment).toMatchObject({
      invoiceId: "invoice-1",
      orderId: "order-1",
      status: PaymentStatus.APPROVED,
      failureReason: null,
    });
    expect(payment.amount.cents).toBe(1050);
    expect(payment.createdAt).toBeInstanceOf(Date);
  });

  it("creates a failed payment with the reason", () => {
    const payment = PaymentEntity.fail(props(), "Card declined");

    expect(payment.status).toBe(PaymentStatus.FAILED);
    expect(payment.failureReason).toBe("Card declined");
  });

  it("rejects a failed payment without reason", () => {
    expect(() => PaymentEntity.fail(props(), " ")).toThrow(
      InvalidFailureReasonError,
    );
  });

  it("rejects a zero amount", () => {
    expect(() =>
      PaymentEntity.approve({ ...props(), amount: Money.fromCents(0) }),
    ).toThrow(InvalidPaymentAmountError);
  });

  it("rejects an empty invoiceId", () => {
    expect(() => PaymentEntity.approve({ ...props(), invoiceId: "" })).toThrow(
      InvalidInvoiceIdError,
    );
  });

  it("restores an existing payment", () => {
    const payment = PaymentEntity.restore({
      id: "payment-1",
      ...props(),
      status: PaymentStatus.FAILED,
      failureReason: "Card declined",
      createdAt: new Date("2026-10-09T12:00:00.000Z"),
    });

    expect(payment.id).toBe("payment-1");
    expect(payment.failureReason).toBe("Card declined");
  });
});
