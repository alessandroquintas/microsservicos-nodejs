import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../src/infra/db/client.ts";
import { schema } from "../../../src/infra/db/schema/index.ts";
import { DrizzleUnitOfWork } from "../../../src/infra/db/drizzle-unit-of-work.ts";
import { OrderEntity } from "../../../src/domain/order/order-entity.ts";
import { Money } from "../../../src/domain/shared/money.ts";

const CUSTOMER_ID = "customer-1";
const sut = new DrizzleUnitOfWork(db);

function makeOrder() {
  return OrderEntity.create({
    customerId: CUSTOMER_ID,
    amount: Money.fromCents(100),
  });
}

function messageFor(order: OrderEntity) {
  return {
    orderId: order.id,
    amount: order.amount.cents,
    customer: {
      id: randomUUID(),
      name: "John Doe",
      email: "johndoe@example.com",
    },
  };
}

beforeEach(async () => {
  await db.delete(schema.outboxEvents);
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

describe("DrizzleUnitOfWork", () => {
  it("commits the order and the event together", async () => {
    const order = makeOrder();

    await sut.run(async ({ orders, orderEvents }) => {
      await orders.save(order);
      await orderEvents.publishOrderCreated(messageFor(order));
    });

    expect(await db.select().from(schema.orders)).toHaveLength(1);
    expect(await db.select().from(schema.outboxEvents)).toHaveLength(1);
  });

  it("rolls back the order when storing the event fails", async () => {
    const order = makeOrder();

    await expect(
      sut.run(async ({ orders, orderEvents }) => {
        await orders.save(order);
        await orderEvents.publishOrderCreated({
          ...messageFor(order),
          amount: -1,
        });
      }),
    ).rejects.toThrow();

    expect(await db.select().from(schema.orders)).toHaveLength(0);
    expect(await db.select().from(schema.outboxEvents)).toHaveLength(0);
  });
});
