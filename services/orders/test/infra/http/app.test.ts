import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { CustomerNotFoundError } from "../../../src/domain/customer/errors.ts";
import { buildApp } from "../../../src/infra/http/app.ts";

const createOrder = { execute: vi.fn() };
const app = buildApp({ createOrder });

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await app.close();
});

describe("POST /orders", () => {
  it("creates an order and returns its id", async () => {
    createOrder.execute.mockResolvedValueOnce({ id: "order-1" });

    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { amount: 100 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ orderId: "order-1" });
    expect(createOrder.execute).toHaveBeenCalledWith({
      customerId: expect.any(String),
      amountInCents: 100,
    });
  });

  it.each(["abc", -10, 0, 10.5])(
    "returns 400 when amount is %s",
    async (amount) => {
      const response = await app.inject({
        method: "POST",
        url: "/orders",
        payload: { amount },
      });

      expect(response.statusCode).toBe(400);
      expect(createOrder.execute).not.toHaveBeenCalled();
    },
  );

  it("returns 404 when the customer does not exist", async () => {
    createOrder.execute.mockRejectedValueOnce(
      new CustomerNotFoundError("customer-1"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { amount: 100 },
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns a generic 500 without leaking internal details", async () => {
    createOrder.execute.mockRejectedValueOnce(
      new Error('Failed query: select "id" from "customers"'),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { amount: 100 },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: "Internal server error" });
    expect(response.body).not.toContain("select");
  });
});
