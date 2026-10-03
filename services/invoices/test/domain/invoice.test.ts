import { describe, it, expect } from "vitest";
import { InvoiceEntity } from "../../src/domain/invoices-entity.ts";
import { InvalidOrderIdError } from "../../src/domain/errors.ts";

describe("InvoiceEntity", () => {
  it("creates an invoice with a generated id", () => {
    const invoice = InvoiceEntity.create({ orderId: "order-1" });

    expect(invoice.id).toEqual(expect.any(String));
    expect(invoice.orderId).toBe("order-1");
  });

  it("generates a different id for each invoice", () => {
    const a = InvoiceEntity.create({ orderId: "order-1" });
    const b = InvoiceEntity.create({ orderId: "order-1" });

    expect(a.id).not.toBe(b.id);
  });

  it("rejects an empty orderId", () => {
    expect(() => InvoiceEntity.create({ orderId: "  " })).toThrow(
      InvalidOrderIdError,
    );
  });

  it("restores an existing invoice without generating a new id", () => {
    const invoice = InvoiceEntity.restore({
      id: "invoice-1",
      orderId: "order-1",
    });

    expect(invoice.id).toBe("invoice-1");
  });
});
