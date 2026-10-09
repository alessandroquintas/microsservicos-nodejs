import { describe, it, expect, vi, afterAll, beforeEach } from "vitest";
import { CustomerEntity } from "../../../src/domain/customer/customer-entity.ts";
import {
  CustomerAlreadyExistsError,
  CustomerNotFoundError,
  EmptyCustomerFieldError,
} from "../../../src/domain/customer/errors.ts";
import {
  InvalidOrderStatusTransitionError,
  OrderNotFoundError,
} from "../../../src/domain/order/errors.ts";
import { buildApp } from "../../../src/infra/http/app.ts";

const createOrder = { execute: vi.fn() };
const createCustomer = { execute: vi.fn() };
const getCustomer = { execute: vi.fn() };
const getOrder = { execute: vi.fn() };
const listOrders = { execute: vi.fn() };
const cancelOrder = { execute: vi.fn() };
const app = buildApp({
  createOrder,
  createCustomer,
  getCustomer,
  getOrder,
  listOrders,
  cancelOrder,
});

const ORDER_ID = "0b8c1f8e-3d0a-4f7e-9a51-2f4c8f1d9a10";

function orderView() {
  return {
    id: ORDER_ID,
    customerId: "5961a952-0d3e-465f-b635-4b93a1cefa97",
    amount: 1050,
    status: "pending",
    createdAt: "2026-10-09T12:00:00.000Z",
  };
}

function customerBody() {
  return {
    name: "John Doe",
    email: "johndoe@example.com",
    address: "Rua das Flores, 123",
    state: "PR",
    zipCode: "80000-000",
    country: "Brazil",
    dateOfBirth: "1990-05-10",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await app.close();
});

describe("POST /customers", () => {
  it("creates a customer and returns its id", async () => {
    createCustomer.execute.mockResolvedValueOnce({ id: "customer-1" });

    const response = await app.inject({
      method: "POST",
      url: "/customers",
      payload: customerBody(),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ customerId: "customer-1" });
    expect(createCustomer.execute).toHaveBeenCalledWith({
      ...customerBody(),
      dateOfBirth: new Date("1990-05-10"),
    });
  });

  it("passes a null date of birth when it is not informed", async () => {
    createCustomer.execute.mockResolvedValueOnce({ id: "customer-1" });
    const { dateOfBirth: _, ...body } = customerBody();

    const response = await app.inject({
      method: "POST",
      url: "/customers",
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    expect(createCustomer.execute).toHaveBeenCalledWith({
      ...body,
      dateOfBirth: null,
    });
  });

  it.each([
    ["an invalid email", { email: "not-an-email" }],
    ["a missing name", { name: undefined }],
    ["an invalid date of birth", { dateOfBirth: "10/05/1990" }],
  ])("returns 400 for %s", async (_, override) => {
    const response = await app.inject({
      method: "POST",
      url: "/customers",
      payload: { ...customerBody(), ...override },
    });

    expect(response.statusCode).toBe(400);
    expect(createCustomer.execute).not.toHaveBeenCalled();
  });

  it("returns 400 when the domain rejects the data", async () => {
    createCustomer.execute.mockRejectedValueOnce(
      new EmptyCustomerFieldError("name"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/customers",
      payload: { ...customerBody(), name: "  " },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      message: "Customer name must not be empty",
    });
  });

  it("returns 409 when the email is already registered", async () => {
    createCustomer.execute.mockRejectedValueOnce(
      new CustomerAlreadyExistsError("johndoe@example.com"),
    );

    const response = await app.inject({
      method: "POST",
      url: "/customers",
      payload: customerBody(),
    });

    expect(response.statusCode).toBe(409);
  });
});

describe("GET /customers/:id", () => {
  it("returns the customer", async () => {
    getCustomer.execute.mockResolvedValueOnce(
      CustomerEntity.restore({
        id: "customer-1",
        name: "John Doe",
        email: "johndoe@example.com",
        address: "Rua das Flores, 123",
        state: "PR",
        zipCode: "80000-000",
        country: "Brazil",
        dateOfBirth: new Date("1990-05-10"),
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/customers/customer-1",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      id: "customer-1",
      name: "John Doe",
      email: "johndoe@example.com",
      address: "Rua das Flores, 123",
      state: "PR",
      zipCode: "80000-000",
      country: "Brazil",
      dateOfBirth: "1990-05-10T00:00:00.000Z",
    });
    expect(getCustomer.execute).toHaveBeenCalledWith({
      customerId: "customer-1",
    });
  });

  it("returns a null date of birth", async () => {
    getCustomer.execute.mockResolvedValueOnce(
      CustomerEntity.restore({
        id: "customer-1",
        name: "John Doe",
        email: "johndoe@example.com",
        address: "Rua das Flores, 123",
        state: "PR",
        zipCode: "80000-000",
        country: "Brazil",
        dateOfBirth: null,
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/customers/customer-1",
    });

    expect(response.json().dateOfBirth).toBeNull();
  });

  it("returns 404 when the customer does not exist", async () => {
    getCustomer.execute.mockRejectedValueOnce(
      new CustomerNotFoundError("customer-1"),
    );

    const response = await app.inject({
      method: "GET",
      url: "/customers/customer-1",
    });

    expect(response.statusCode).toBe(404);
  });
});

const CUSTOMER_ID = "5961a952-0d3e-465f-b635-4b93a1cefa97";

describe("POST /orders", () => {
  it("creates an order and returns its id", async () => {
    createOrder.execute.mockResolvedValueOnce({ id: "order-1" });

    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { customerId: CUSTOMER_ID, amount: 100 },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ orderId: "order-1" });
    expect(createOrder.execute).toHaveBeenCalledWith({
      customerId: CUSTOMER_ID,
      amountInCents: 100,
    });
  });

  it.each([
    ["missing", undefined],
    ["not a UUID", "customer-1"],
  ])("returns 400 when customerId is %s", async (_, customerId) => {
    const response = await app.inject({
      method: "POST",
      url: "/orders",
      payload: { customerId, amount: 100 },
    });

    expect(response.statusCode).toBe(400);
    expect(createOrder.execute).not.toHaveBeenCalled();
  });

  it.each(["abc", -10, 0, 10.5])(
    "returns 400 when amount is %s",
    async (amount) => {
      const response = await app.inject({
        method: "POST",
        url: "/orders",
        payload: { customerId: CUSTOMER_ID, amount },
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
      payload: { customerId: CUSTOMER_ID, amount: 100 },
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
      payload: { customerId: CUSTOMER_ID, amount: 100 },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: "Internal server error" });
    expect(response.body).not.toContain("select");
  });
});

describe("GET /orders", () => {
  it("returns the page with the default parameters", async () => {
    const page = { items: [orderView()], page: 1, pageSize: 20, total: 1 };
    listOrders.execute.mockResolvedValueOnce(page);

    const response = await app.inject({ method: "GET", url: "/orders" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(page);
    expect(listOrders.execute).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it("passes the filters and the pagination", async () => {
    listOrders.execute.mockResolvedValueOnce({
      items: [],
      page: 2,
      pageSize: 10,
      total: 0,
    });

    const response = await app.inject({
      method: "GET",
      url: "/orders",
      query: {
        page: "2",
        pageSize: "10",
        status: "paid",
        customerId: CUSTOMER_ID,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(listOrders.execute).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      status: "paid",
      customerId: CUSTOMER_ID,
    });
  });

  it.each([
    ["pageSize above 100", { pageSize: "101" }],
    ["page below 1", { page: "0" }],
    ["an invalid status", { status: "shipped" }],
    ["a customerId that is not a UUID", { customerId: "customer-1" }],
  ])("returns 400 for %s", async (_, query) => {
    const response = await app.inject({ method: "GET", url: "/orders", query });

    expect(response.statusCode).toBe(400);
    expect(listOrders.execute).not.toHaveBeenCalled();
  });
});

describe("GET /orders/:id", () => {
  it("returns the order", async () => {
    getOrder.execute.mockResolvedValueOnce(orderView());

    const response = await app.inject({
      method: "GET",
      url: `/orders/${ORDER_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(orderView());
    expect(getOrder.execute).toHaveBeenCalledWith({ orderId: ORDER_ID });
  });

  it("returns 404 when the order does not exist", async () => {
    getOrder.execute.mockRejectedValueOnce(new OrderNotFoundError(ORDER_ID));

    const response = await app.inject({
      method: "GET",
      url: `/orders/${ORDER_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 400 when the id is not a UUID", async () => {
    const response = await app.inject({ method: "GET", url: "/orders/abc" });

    expect(response.statusCode).toBe(400);
    expect(getOrder.execute).not.toHaveBeenCalled();
  });
});

describe("POST /orders/:id/cancel", () => {
  it("cancels the order and returns the updated view", async () => {
    const canceled = { ...orderView(), status: "canceled" };
    getOrder.execute.mockResolvedValueOnce(canceled);

    const response = await app.inject({
      method: "POST",
      url: `/orders/${ORDER_ID}/cancel`,
      payload: { reason: "Changed my mind" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(canceled);
    expect(cancelOrder.execute).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      reason: "Changed my mind",
    });
    expect(getOrder.execute).toHaveBeenCalledWith({ orderId: ORDER_ID });
  });

  it("uses the default reason when the body is empty", async () => {
    getOrder.execute.mockResolvedValueOnce({
      ...orderView(),
      status: "canceled",
    });

    const response = await app.inject({
      method: "POST",
      url: `/orders/${ORDER_ID}/cancel`,
    });

    expect(response.statusCode).toBe(200);
    expect(cancelOrder.execute).toHaveBeenCalledWith({
      orderId: ORDER_ID,
      reason: "Canceled by customer",
    });
  });

  it("returns 200 when the order is already canceled", async () => {
    // O use case é idempotente: devolve o pedido sem lançar.
    const canceled = { ...orderView(), status: "canceled" };
    getOrder.execute
      .mockResolvedValueOnce(canceled)
      .mockResolvedValueOnce(canceled);

    const first = await app.inject({
      method: "POST",
      url: `/orders/${ORDER_ID}/cancel`,
    });
    const second = await app.inject({
      method: "POST",
      url: `/orders/${ORDER_ID}/cancel`,
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe("canceled");
  });

  it("returns 404 when the order does not exist", async () => {
    cancelOrder.execute.mockRejectedValueOnce(new OrderNotFoundError(ORDER_ID));

    const response = await app.inject({
      method: "POST",
      url: `/orders/${ORDER_ID}/cancel`,
    });

    expect(response.statusCode).toBe(404);
    expect(getOrder.execute).not.toHaveBeenCalled();
  });

  it("returns 409 when the order is already paid", async () => {
    cancelOrder.execute.mockRejectedValueOnce(
      new InvalidOrderStatusTransitionError("paid", "canceled"),
    );

    const response = await app.inject({
      method: "POST",
      url: `/orders/${ORDER_ID}/cancel`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toContain(
      "only pending orders can be canceled",
    );
  });

  it("returns 400 when the id is not a UUID", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/orders/abc/cancel",
    });

    expect(response.statusCode).toBe(400);
    expect(cancelOrder.execute).not.toHaveBeenCalled();
  });
});

describe("GET /docs/json", () => {
  it("documents the business routes in the OpenAPI spec", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json().paths)).toEqual([
      "/customers",
      "/customers/{id}",
      "/orders",
      "/orders/{id}",
      "/orders/{id}/cancel",
    ]);
  });
});
