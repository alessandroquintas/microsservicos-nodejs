import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { app } from "../src/http/app.ts";
import { db } from "../src/db/client.ts";
import { schema } from "../src/db/schema/index.ts";
import { dispatchOrderCreated } from "../src/broker/messages/order-created.ts";

vi.mock("../src/broker/messages/order-created.ts", () => ({
  dispatchOrderCreated: vi.fn(),
}));

const CUSTOMER_ID = "5961a952-0d3e-465f-b635-4b93a1cefa97";

beforeEach(async () => {
  vi.clearAllMocks();

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
  await app.close();
  await db.$client.end();
});

describe("POST /orders", () => {
  it("creates a pending order and dispatches OrderCreated", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: {
        amount: 100,
      },
    });

    expect(response.statusCode).toBe(201);

    const orders = await db.select().from(schema.orders);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      amount: 100,
      status: "pending",
    });

    expect(dispatchOrderCreated).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: orders[0].id, amount: 100 }),
    );
  });

  it("returns 400 when amount is invalid", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { amount: "abc" },
    });

    expect(response.statusCode).toBe(400);
    expect(dispatchOrderCreated).not.toHaveBeenCalled();
  });

  it.each([-10, 0, 10.5])("returns 400 when amount is %s", async (amount) => {
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { amount },
    });

    expect(response.statusCode).toBe(400);
    expect(dispatchOrderCreated).not.toHaveBeenCalled();
  });
});
