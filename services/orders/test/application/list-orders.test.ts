import { beforeEach, describe, expect, it } from "vitest";
import { ListOrdersUseCase } from "../../src/application/use-cases/list-orders.ts";
import { FakeOrdersQuery } from "../fakes/fake-orders-query.ts";

let ordersQuery: FakeOrdersQuery;
let sut: ListOrdersUseCase;

beforeEach(() => {
  ordersQuery = new FakeOrdersQuery();
  sut = new ListOrdersUseCase(ordersQuery);

  ordersQuery.items.push(
    {
      id: "order-1",
      customerId: "customer-1",
      amount: 100,
      status: "pending",
      createdAt: "2026-10-09T10:00:00.000Z",
    },
    {
      id: "order-2",
      customerId: "customer-2",
      amount: 200,
      status: "paid",
      createdAt: "2026-10-09T11:00:00.000Z",
    },
  );
});

describe("ListOrdersUseCase", () => {
  it("returns a page of orders", async () => {
    const page = await sut.execute({ page: 1, pageSize: 20 });

    expect(page.total).toBe(2);
    expect(page.items.map((order) => order.id)).toEqual(["order-2", "order-1"]);
  });

  it("applies the filters", async () => {
    const page = await sut.execute({ page: 1, pageSize: 20, status: "paid" });

    expect(page).toEqual({
      items: [expect.objectContaining({ id: "order-2" })],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });
});
