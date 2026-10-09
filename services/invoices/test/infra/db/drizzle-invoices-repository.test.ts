import { describe, it, expect, beforeEach, afterAll } from "vitest";

import {
  InvoiceEntity,
  InvoiceStatus,
} from "../../../src/domain/invoice/invoice-entity.ts";
import { Money } from "../../../src/domain/shared/money.ts";
import { randomUUID } from "node:crypto";
import { DrizzleInvoicesRepository } from "../../../src/infra/db/repositories/drizzle-invoices-repository.ts";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";

const sut = new DrizzleInvoicesRepository(db);

function makeInvoice(orderId = randomUUID()) {
  return InvoiceEntity.create({
    orderId,
    amount: Money.fromCents(1050),
    customer: {
      id: randomUUID(),
      name: "John Doe",
      email: "johndoe@example.com",
    },
  });
}

beforeEach(async () => {
  await db.delete(schema.invoices);
});
afterAll(async () => {
  await db.$client.end();
});

describe("DrizzleInvoicesRepository", () => {
  it("persists all the invoice fields", async () => {
    const invoice = makeInvoice();

    await sut.save(invoice);

    const rows = await db.select().from(schema.invoices);
    expect(rows).toEqual([
      {
        id: invoice.id,
        orderId: invoice.orderId,
        amount: 1050,
        status: "open",
        customerId: invoice.customer.id,
        customerName: "John Doe",
        customerEmail: "johndoe@example.com",
        dueDate: invoice.dueDate,
        createdAt: invoice.createdAt,
      },
    ]);
  });

  it("finds an invoice by order id with all its fields", async () => {
    const invoice = makeInvoice();
    await sut.save(invoice);

    const found = await sut.findByOrderId(invoice.orderId);

    expect(found).toBeInstanceOf(InvoiceEntity);
    expect(found).toEqual(invoice);
    expect(found?.status).toBe(InvoiceStatus.OPEN);
  });

  it("finds an invoice by id", async () => {
    const invoice = makeInvoice();
    await sut.save(invoice);

    const found = await sut.findById(invoice.id);

    expect(found).toEqual(invoice);
  });

  it("returns null when there is no invoice", async () => {
    expect(await sut.findByOrderId(randomUUID())).toBeNull();
    expect(await sut.findById(randomUUID())).toBeNull();
  });

  it("ignores a second invoice for the same order", async () => {
    const orderId = randomUUID();
    const first = makeInvoice(orderId);
    const second = makeInvoice(orderId);

    await sut.save(first);
    await sut.save(second);

    const rows = await db.select().from(schema.invoices);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
  });

  it("updates the status of an existing invoice", async () => {
    const invoice = makeInvoice();
    await sut.save(invoice);

    invoice.markAsPaid();
    await sut.save(invoice);

    const found = await sut.findById(invoice.id);
    expect(found?.status).toBe(InvoiceStatus.PAID);
    expect(await db.select().from(schema.invoices)).toHaveLength(1);
  });
});
