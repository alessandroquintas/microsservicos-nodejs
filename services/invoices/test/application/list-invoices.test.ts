import { beforeEach, describe, expect, it } from "vitest";
import { ListInvoicesUseCase } from "../../src/application/use-cases/list-invoices.ts";
import { FakeInvoicesQuery } from "../fakes/fake-invoices-query.ts";

const customer = {
  id: "customer-1",
  name: "John Doe",
  email: "john@example.com",
};

let invoicesQuery: FakeInvoicesQuery;
let sut: ListInvoicesUseCase;

beforeEach(() => {
  invoicesQuery = new FakeInvoicesQuery();
  sut = new ListInvoicesUseCase(invoicesQuery);

  invoicesQuery.items.push(
    {
      id: "invoice-1",
      orderId: "order-1",
      amount: 100,
      status: "open",
      customer,
      dueDate: "2026-10-16T10:00:00.000Z",
      createdAt: "2026-10-09T10:00:00.000Z",
    },
    {
      id: "invoice-2",
      orderId: "order-2",
      amount: 200,
      status: "paid",
      customer,
      dueDate: "2026-10-16T11:00:00.000Z",
      createdAt: "2026-10-09T11:00:00.000Z",
    },
  );
});

describe("ListInvoicesUseCase", () => {
  it("returns a page of invoices", async () => {
    const page = await sut.execute({ page: 1, pageSize: 20 });

    expect(page.total).toBe(2);
    expect(page.items.map((invoice) => invoice.id)).toEqual([
      "invoice-2",
      "invoice-1",
    ]);
  });

  it("applies the filters", async () => {
    const page = await sut.execute({
      page: 1,
      pageSize: 20,
      orderId: "order-1",
    });

    expect(page).toEqual({
      items: [expect.objectContaining({ id: "invoice-1" })],
      page: 1,
      pageSize: 20,
      total: 1,
    });
  });
});
