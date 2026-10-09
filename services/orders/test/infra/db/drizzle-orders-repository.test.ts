import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { Money } from "../../../src/domain/shared/money.ts";
import {
  OrderEntity,
  OrderStatus,
} from "../../../src/domain/order/order-entity.ts";
import { DrizzleOrdersRepository } from "../../../src/infra/db/repositories/drizzle-orders-repository.ts";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";

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

  it("finds an order by id", async () => {
    const order = OrderEntity.create({
      customerId: CUSTOMER_ID,
      amount: Money.fromCents(1050),
    });
    await sut.save(order);

    const found = await sut.findById(order.id);

    expect(found).toBeInstanceOf(OrderEntity);
    expect(found).toMatchObject({
      id: order.id,
      customerId: CUSTOMER_ID,
      status: OrderStatus.PENDING,
      createdAt: order.createdAt,
    });
    expect(found?.amount.cents).toBe(1050);
  });

  it("returns null when the order does not exist", async () => {
    expect(await sut.findById("unknown")).toBeNull();
  });

  it("updates the status of an existing order", async () => {
    const order = OrderEntity.create({
      customerId: CUSTOMER_ID,
      amount: Money.fromCents(1050),
    });
    await sut.save(order);

    order.pay();
    await sut.save(order);

    const rows = await db.select().from(schema.orders);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("paid");
  });
});
