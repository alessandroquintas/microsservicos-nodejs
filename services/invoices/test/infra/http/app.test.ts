import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoiceNotFoundError } from "../../../src/domain/invoice/errors.ts";
import { buildApp } from "../../../src/infra/http/app.ts";

const getInvoice = { execute: vi.fn() };
const listInvoices = { execute: vi.fn() };
const app = buildApp({ getInvoice, listInvoices });

const INVOICE_ID = "6f1e2d3c-4b5a-4c7d-8e9f-0a1b2c3d4e5f";
const ORDER_ID = "0b8c1f8e-3d0a-4f7e-9a51-2f4c8f1d9a10";

function invoiceView() {
  return {
    id: INVOICE_ID,
    orderId: ORDER_ID,
    amount: 1050,
    status: "open",
    customer: {
      id: "5961a952-0d3e-465f-b635-4b93a1cefa97",
      name: "John Doe",
      email: "johndoe@example.com",
    },
    dueDate: "2026-10-16T12:00:00.000Z",
    createdAt: "2026-10-09T12:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("returns Ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("Ok");
  });
});

describe("GET /invoices", () => {
  it("returns the page with the default parameters", async () => {
    const page = { items: [invoiceView()], page: 1, pageSize: 20, total: 1 };
    listInvoices.execute.mockResolvedValueOnce(page);

    const response = await app.inject({ method: "GET", url: "/invoices" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(page);
    expect(listInvoices.execute).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
    });
  });

  it("passes the filters and the pagination", async () => {
    listInvoices.execute.mockResolvedValueOnce({
      items: [],
      page: 2,
      pageSize: 10,
      total: 0,
    });

    const response = await app.inject({
      method: "GET",
      url: "/invoices",
      query: { page: "2", pageSize: "10", status: "paid", orderId: ORDER_ID },
    });

    expect(response.statusCode).toBe(200);
    expect(listInvoices.execute).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      status: "paid",
      orderId: ORDER_ID,
    });
  });

  it.each([
    ["pageSize above 100", { pageSize: "101" }],
    ["page below 1", { page: "0" }],
    ["an invalid status", { status: "pending" }],
    ["an orderId that is not a UUID", { orderId: "order-1" }],
  ])("returns 400 for %s", async (_, query) => {
    const response = await app.inject({
      method: "GET",
      url: "/invoices",
      query,
    });

    expect(response.statusCode).toBe(400);
    expect(listInvoices.execute).not.toHaveBeenCalled();
  });
});

describe("GET /invoices/:id", () => {
  it("returns the invoice", async () => {
    getInvoice.execute.mockResolvedValueOnce(invoiceView());

    const response = await app.inject({
      method: "GET",
      url: `/invoices/${INVOICE_ID}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(invoiceView());
    expect(getInvoice.execute).toHaveBeenCalledWith({ invoiceId: INVOICE_ID });
  });

  it("returns 404 when the invoice does not exist", async () => {
    getInvoice.execute.mockRejectedValueOnce(
      new InvoiceNotFoundError(INVOICE_ID),
    );

    const response = await app.inject({
      method: "GET",
      url: `/invoices/${INVOICE_ID}`,
    });

    expect(response.statusCode).toBe(404);
  });

  it("returns 400 when the id is not a UUID", async () => {
    const response = await app.inject({ method: "GET", url: "/invoices/abc" });

    expect(response.statusCode).toBe(400);
    expect(getInvoice.execute).not.toHaveBeenCalled();
  });

  it("returns a generic 500 without leaking internal details", async () => {
    getInvoice.execute.mockRejectedValueOnce(
      new Error('Failed query: select "id" from "invoices"'),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await app.inject({
      method: "GET",
      url: `/invoices/${INVOICE_ID}`,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ message: "Internal server error" });
  });
});
