import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../src/db/client.ts";
import { schema } from "../../src/db/schema/index.ts";
import { DrizzleOrdersRepository } from "../../src/db/repositories/drizzle-orders-repository.ts";

import { Money } from "../../src/domain/shared/money.ts";
import { OrderEntity } from "../../src/domain/orders-entity.ts";

const CUSTOMER_ID = "customer-1";
const sut = new DrizzleOrdersRepository(db);

beforeEach(async () => {
  await db.delete(schema.orders);
  await db.delete(schema.customers);
  await db.insert(schema.customers).values({
    id: CUSTOMER_ID,
    name: "John Doe",
    email: "johndoe@example.com",
    address: "Rua das Flores, 123",
    state: "PR",
    zipCode: "80000-000",
    country: "Brazil",
  });
});

afterAll(async () => {
  await db.$client.end();
});

describe("DrizzleOrdersRepository", () => {
  it("persists an order", async () => {
    const order = OrderEntity.create({
      customerId: CUSTOMER_ID,
      amount: Money.fromCents(1050),
    });

    await sut.save(order);

    const rows = await db.select().from(schema.orders);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: order.id,
      customerId: CUSTOMER_ID,
      amount: 1050,
      status: "pending",
    });
  });
});
