import { describe, it, expect } from "vitest";
import {
  InvoiceEntity,
  InvoiceStatus,
} from "../../src/domain/invoice/invoice-entity.ts";
import {
  InvalidInvoiceAmountError,
  InvalidInvoiceStatusTransitionError,
  InvalidOrderIdError,
} from "../../src/domain/invoice/errors.ts";
import { Money } from "../../src/domain/shared/money.ts";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const customer = {
  id: "customer-1",
  name: "John Doe",
  email: "johndoe@example.com",
};

function makeInvoice() {
  return InvoiceEntity.create({
    orderId: "order-1",
    amount: Money.fromCents(1050),
    customer,
  });
}

describe("InvoiceEntity", () => {
  it("creates an open invoice with amount and customer snapshot", () => {
    const invoice = makeInvoice();

    expect(invoice.id).toEqual(expect.any(String));
    expect(invoice.orderId).toBe("order-1");
    expect(invoice.amount.cents).toBe(1050);
    expect(invoice.status).toBe(InvoiceStatus.OPEN);
    expect(invoice.customer).toEqual(customer);
    expect(invoice.createdAt).toBeInstanceOf(Date);
  });

  it("is due 7 days after its creation", () => {
    const invoice = makeInvoice();

    expect(invoice.dueDate.getTime() - invoice.createdAt.getTime()).toBe(
      7 * DAY_IN_MS,
    );
  });

  it("generates a different id for each invoice", () => {
    expect(makeInvoice().id).not.toBe(makeInvoice().id);
  });

  it("rejects an empty orderId", () => {
    expect(() =>
      InvoiceEntity.create({
        orderId: "  ",
        amount: Money.fromCents(1050),
        customer,
      }),
    ).toThrow(InvalidOrderIdError);
  });

  it("rejects a zero amount", () => {
    expect(() =>
      InvoiceEntity.create({
        orderId: "order-1",
        amount: Money.fromCents(0),
        customer,
      }),
    ).toThrow(InvalidInvoiceAmountError);
  });

  it("restores an existing invoice without generating a new id", () => {
    const invoice = InvoiceEntity.restore({
      id: "invoice-1",
      orderId: "order-1",
      amount: Money.fromCents(1050),
      status: InvoiceStatus.PAID,
      customer,
      dueDate: new Date("2026-10-16T12:00:00.000Z"),
      createdAt: new Date("2026-10-09T12:00:00.000Z"),
    });

    expect(invoice.id).toBe("invoice-1");
    expect(invoice.status).toBe(InvoiceStatus.PAID);
  });

  describe("markAsPaid", () => {
    it("pays an open invoice", () => {
      const invoice = makeInvoice();

      invoice.markAsPaid();

      expect(invoice.status).toBe(InvoiceStatus.PAID);
    });

    it("does nothing when the invoice is already paid", () => {
      const invoice = makeInvoice();
      invoice.markAsPaid();

      invoice.markAsPaid();

      expect(invoice.status).toBe(InvoiceStatus.PAID);
    });

    it("does not pay a canceled invoice", () => {
      const invoice = makeInvoice();
      invoice.cancel();

      expect(() => invoice.markAsPaid()).toThrow(
        InvalidInvoiceStatusTransitionError,
      );
      expect(invoice.status).toBe(InvoiceStatus.CANCELED);
    });
  });

  describe("cancel", () => {
    it("cancels an open invoice", () => {
      const invoice = makeInvoice();

      invoice.cancel();

      expect(invoice.status).toBe(InvoiceStatus.CANCELED);
    });

    it("does nothing when the invoice is already canceled", () => {
      const invoice = makeInvoice();
      invoice.cancel();

      invoice.cancel();

      expect(invoice.status).toBe(InvoiceStatus.CANCELED);
    });

    it("does not cancel a paid invoice", () => {
      const invoice = makeInvoice();
      invoice.markAsPaid();

      expect(() => invoice.cancel()).toThrow(
        InvalidInvoiceStatusTransitionError,
      );
      expect(invoice.status).toBe(InvoiceStatus.PAID);
    });
  });
});
