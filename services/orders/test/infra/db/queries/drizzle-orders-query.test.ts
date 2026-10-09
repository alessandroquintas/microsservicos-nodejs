import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../../src/infra/db/client.ts";
import { schema } from "../../../../src/infra/db/schema/index.ts";
import { DrizzleOrdersQuery } from "../../../../src/infra/db/queries/drizzle-orders-query.ts";

const CUSTOMER_A = randomUUID();
const CUSTOMER_B = randomUUID();
const sut = new DrizzleOrdersQuery(db);

type Status = "pending" | "paid" | "canceled";

async function insertOrder(props: {
  customerId?: string;
  status?: Status;
  minutesAgo: number;
}) {
  const id = randomUUID();
  const createdAt = new Date(Date.now() - props.minutesAgo * 60_000);

  await db.insert(schema.orders).values({
    id,
    customerId: props.customerId ?? CUSTOMER_A,
    amount: 100,
    status: props.status ?? "pending",
    createdAt,
  });

  return { id, createdAt };
}

beforeEach(async () => {
  await db.delete(schema.orders);
  await db.delete(schema.customers);

  for (const [id, email] of [
    [CUSTOMER_A, "a@example.com"],
    [CUSTOMER_B, "b@example.com"],
  ]) {
    await db.insert(schema.customers).values({
      id,
      name: "John Doe",
      email,
      address: "Rua das Flores, 123",
      state: "PR",
      zipCode: "80000-000",
      country: "Brazil",
    });
  }
});

afterAll(async () => {
  await db.$client.end();
});

describe("DrizzleOrdersQuery", () => {
  it("finds an order by id", async () => {
    const { id, createdAt } = await insertOrder({ minutesAgo: 1 });

    expect(await sut.findById(id)).toEqual({
      id,
      customerId: CUSTOMER_A,
      amount: 100,
      status: "pending",
      createdAt: createdAt.toISOString(),
    });
  });

  it("returns null when the order does not exist", async () => {
    expect(await sut.findById(randomUUID())).toBeNull();
  });

  it("orders by createdAt descending", async () => {
    const oldest = await insertOrder({ minutesAgo: 3 });
    const newest = await insertOrder({ minutesAgo: 1 });
    const middle = await insertOrder({ minutesAgo: 2 });

    const page = await sut.list({ page: 1, pageSize: 20 });

    expect(page.items.map((order) => order.id)).toEqual([
      newest.id,
      middle.id,
      oldest.id,
    ]);
  });

  it("paginates and returns the total", async () => {
    const ids = [];
    for (let minutesAgo = 1; minutesAgo <= 5; minutesAgo++) {
      ids.push((await insertOrder({ minutesAgo })).id);
    }

    const second = await sut.list({ page: 2, pageSize: 2 });
    const last = await sut.list({ page: 3, pageSize: 2 });

    expect(second).toMatchObject({ page: 2, pageSize: 2, total: 5 });
    expect(second.items.map((order) => order.id)).toEqual([ids[2], ids[3]]);
    expect(last.items.map((order) => order.id)).toEqual([ids[4]]);
  });

  it("filters by status", async () => {
    await insertOrder({ minutesAgo: 1 });
    const paid = await insertOrder({ status: "paid", minutesAgo: 2 });

    const page = await sut.list({ page: 1, pageSize: 20, status: "paid" });

    expect(page.total).toBe(1);
    expect(page.items.map((order) => order.id)).toEqual([paid.id]);
  });

  it("filters by customer", async () => {
    await insertOrder({ customerId: CUSTOMER_A, minutesAgo: 1 });
    const fromB = await insertOrder({ customerId: CUSTOMER_B, minutesAgo: 2 });

    const page = await sut.list({
      page: 1,
      pageSize: 20,
      customerId: CUSTOMER_B,
    });

    expect(page.total).toBe(1);
    expect(page.items.map((order) => order.id)).toEqual([fromB.id]);
  });
});
