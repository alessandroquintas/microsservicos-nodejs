import { beforeEach, describe, expect, it } from "vitest";
import { GetInvoiceUseCase } from "../../src/application/use-cases/get-invoice.ts";
import { InvoiceNotFoundError } from "../../src/domain/invoice/errors.ts";
import { FakeInvoicesQuery } from "../fakes/fake-invoices-query.ts";

let invoicesQuery: FakeInvoicesQuery;
let sut: GetInvoiceUseCase;

beforeEach(() => {
  invoicesQuery = new FakeInvoicesQuery();
  sut = new GetInvoiceUseCase(invoicesQuery);
});

describe("GetInvoiceUseCase", () => {
  it("returns the invoice view", async () => {
    const view = {
      id: "invoice-1",
      orderId: "order-1",
      amount: 1050,
      status: "open" as const,
      customer: {
        id: "customer-1",
        name: "John Doe",
        email: "john@example.com",
      },
      dueDate: "2026-10-16T12:00:00.000Z",
      createdAt: "2026-10-09T12:00:00.000Z",
    };
    invoicesQuery.items.push(view);

    expect(await sut.execute({ invoiceId: "invoice-1" })).toEqual(view);
  });

  it("fails when the invoice does not exist", async () => {
    await expect(sut.execute({ invoiceId: "unknown" })).rejects.toThrow(
      InvoiceNotFoundError,
    );
  });
});
