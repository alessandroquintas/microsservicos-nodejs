import { beforeEach, describe, expect, it } from "vitest";
import { GetOrderUseCase } from "../../src/application/use-cases/get-order.ts";
import { OrderNotFoundError } from "../../src/domain/order/errors.ts";
import { FakeOrdersQuery } from "../fakes/fake-orders-query.ts";

let ordersQuery: FakeOrdersQuery;
let sut: GetOrderUseCase;

beforeEach(() => {
  ordersQuery = new FakeOrdersQuery();
  sut = new GetOrderUseCase(ordersQuery);
});

describe("GetOrderUseCase", () => {
  it("returns the order view", async () => {
    const view = {
      id: "order-1",
      customerId: "customer-1",
      amount: 100,
      status: "pending" as const,
      createdAt: "2026-10-09T12:00:00.000Z",
    };
    ordersQuery.items.push(view);

    expect(await sut.execute({ orderId: "order-1" })).toEqual(view);
  });

  it("fails when the order does not exist", async () => {
    await expect(sut.execute({ orderId: "unknown" })).rejects.toThrow(
      OrderNotFoundError,
    );
  });
});
