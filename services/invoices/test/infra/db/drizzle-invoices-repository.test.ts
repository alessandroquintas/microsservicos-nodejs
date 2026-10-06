import { describe, it, expect, beforeEach, afterAll } from "vitest";

import { InvoiceEntity } from "../../../src/domain/invoice/invoice-entity.ts";
import { randomUUID } from "node:crypto";
import { DrizzleInvoicesRepository } from "../../../src/infra/db/repositories/drizzle-invoices-repository.ts";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";

const sut = new DrizzleInvoicesRepository(db);

beforeEach(async () => {
  await db.delete(schema.invoices);
});
afterAll(async () => {
  await db.$client.end();
});

describe("DrizzleInvoicesRepository", () => {
  it("persist an invoice", async () => {
    const invoice = InvoiceEntity.create({ orderId: randomUUID() });

    await sut.save(invoice);

    const rows = await db.select().from(schema.invoices);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: invoice.id, orderId: invoice.orderId });
  });

  it("finds an invoice by order id", async () => {
    const invoice = InvoiceEntity.create({ orderId: randomUUID() });
    await sut.save(invoice);

    const found = await sut.findByOrderId(invoice.orderId);

    expect(found).toBeInstanceOf(InvoiceEntity);
    expect(found?.id).toBe(invoice.id);
  });

  it("returns null when there is no invoice for the order", async () => {
    expect(await sut.findByOrderId(randomUUID())).toBeNull();
  });

  it("ignores a second invoice for the same order", async () => {
    const orderId = randomUUID();
    const first = InvoiceEntity.create({ orderId });
    const second = InvoiceEntity.create({ orderId });

    await sut.save(first);
    await sut.save(second);

    const rows = await db.select().from(schema.invoices);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
  });
});
