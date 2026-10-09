import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../../src/infra/db/client.ts";
import { schema } from "../../../../src/infra/db/schema/index.ts";
import { DrizzleInvoicesQuery } from "../../../../src/infra/db/queries/drizzle-invoices-query.ts";

const CUSTOMER_ID = randomUUID();
const sut = new DrizzleInvoicesQuery(db);

type Status = "open" | "paid" | "canceled";

async function insertInvoice(props: {
  orderId?: string;
  status?: Status;
  minutesAgo: number;
}) {
  const id = randomUUID();
  const orderId = props.orderId ?? randomUUID();
  const createdAt = new Date(Date.now() - props.minutesAgo * 60_000);
  const dueDate = new Date(createdAt.getTime() + 7 * 24 * 60 * 60_000);

  await db.insert(schema.invoices).values({
    id,
    orderId,
    amount: 1050,
    status: props.status ?? "open",
    customerId: CUSTOMER_ID,
    customerName: "John Doe",
    customerEmail: "johndoe@example.com",
    dueDate,
    createdAt,
  });

  return { id, orderId, createdAt, dueDate };
}

beforeEach(async () => {
  await db.delete(schema.invoices);
});

afterAll(async () => {
  await db.$client.end();
});

describe("DrizzleInvoicesQuery", () => {
  it("finds an invoice by id", async () => {
    const { id, orderId, createdAt, dueDate } = await insertInvoice({
      minutesAgo: 1,
    });

    expect(await sut.findById(id)).toEqual({
      id,
      orderId,
      amount: 1050,
      status: "open",
      customer: {
        id: CUSTOMER_ID,
        name: "John Doe",
        email: "johndoe@example.com",
      },
      dueDate: dueDate.toISOString(),
      createdAt: createdAt.toISOString(),
    });
  });

  it("returns null when the invoice does not exist", async () => {
    expect(await sut.findById(randomUUID())).toBeNull();
  });

  it("orders by createdAt descending", async () => {
    const oldest = await insertInvoice({ minutesAgo: 3 });
    const newest = await insertInvoice({ minutesAgo: 1 });
    const middle = await insertInvoice({ minutesAgo: 2 });

    const page = await sut.list({ page: 1, pageSize: 20 });

    expect(page.items.map((invoice) => invoice.id)).toEqual([
      newest.id,
      middle.id,
      oldest.id,
    ]);
  });

  it("paginates and returns the total", async () => {
    const ids = [];
    for (let minutesAgo = 1; minutesAgo <= 5; minutesAgo++) {
      ids.push((await insertInvoice({ minutesAgo })).id);
    }

    const second = await sut.list({ page: 2, pageSize: 2 });
    const last = await sut.list({ page: 3, pageSize: 2 });

    expect(second).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(second.items.map((invoice) => invoice.id)).toEqual([ids[2], ids[3]]);
    expect(last.items.map((invoice) => invoice.id)).toEqual([ids[4]]);
  });

  it("filters by status", async () => {
    await insertInvoice({ minutesAgo: 1 });
    const paid = await insertInvoice({ status: "paid", minutesAgo: 2 });

    const page = await sut.list({ page: 1, pageSize: 20, status: "paid" });

    expect(page.total).toBe(1);
    expect(page.items.map((invoice) => invoice.id)).toEqual([paid.id]);
  });

  it("filters by order", async () => {
    await insertInvoice({ minutesAgo: 1 });
    const target = await insertInvoice({ minutesAgo: 2 });

    const page = await sut.list({
      page: 1,
      pageSize: 20,
      orderId: target.orderId,
    });

    expect(page.total).toBe(1);
    expect(page.items.map((invoice) => invoice.id)).toEqual([target.id]);
  });
});
