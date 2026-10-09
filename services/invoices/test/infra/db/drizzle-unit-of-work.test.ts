import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";
import { DrizzleUnitOfWork } from "../../../src/infra/db/drizzle-unit-of-work.ts";
import { InvoiceEntity } from "../../../src/domain/invoice/invoice-entity.ts";
import { Money } from "../../../src/domain/shared/money.ts";

const sut = new DrizzleUnitOfWork(db);

function makeInvoice() {
  return InvoiceEntity.create({
    orderId: randomUUID(),
    amount: Money.fromCents(1050),
    customer: {
      id: randomUUID(),
      name: "John Doe",
      email: "johndoe@example.com",
    },
  });
}

function messageFor(invoice: InvoiceEntity) {
  return {
    invoiceId: invoice.id,
    orderId: invoice.orderId,
    amount: invoice.amount.cents,
    customer: invoice.customer,
    dueDate: invoice.dueDate.toISOString(),
  };
}

beforeEach(async () => {
  await db.delete(schema.outboxEvents);
  await db.delete(schema.invoices);
});

afterAll(async () => {
  await db.$client.end();
});

describe("DrizzleUnitOfWork", () => {
  it("commits the invoice and the event together", async () => {
    const invoice = makeInvoice();

    await sut.run(async ({ invoices, invoiceEvents }) => {
      await invoices.save(invoice);
      await invoiceEvents.publishInvoiceCreated(messageFor(invoice));
    });

    expect(await db.select().from(schema.invoices)).toHaveLength(1);
    expect(await db.select().from(schema.outboxEvents)).toHaveLength(1);
  });

  it("rolls back the invoice when storing the event fails", async () => {
    const invoice = makeInvoice();

    await expect(
      sut.run(async ({ invoices, invoiceEvents }) => {
        await invoices.save(invoice);
        await invoiceEvents.publishInvoiceCreated({
          ...messageFor(invoice),
          amount: -1,
        });
      }),
    ).rejects.toThrow();

    expect(await db.select().from(schema.invoices)).toHaveLength(0);
    expect(await db.select().from(schema.outboxEvents)).toHaveLength(0);
  });
});
