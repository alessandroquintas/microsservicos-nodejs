import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryInvoicesRepository } from "./repositories/in-memory-invoices-repository.ts";
import { CreateInvoiceFromOrderUseCase } from "../src/application/use-cases/create-invoice-from-order.ts";

let invoicesRepository: InMemoryInvoicesRepository;
let sut: CreateInvoiceFromOrderUseCase;

beforeEach(() => {
  invoicesRepository = new InMemoryInvoicesRepository();
  sut = new CreateInvoiceFromOrderUseCase(invoicesRepository);
});

describe("CreateInvoiceFromOrderUseCase", () => {
  it("creates and saves an invoice for the order", async () => {
    const invoice = await sut.execute({ orderId: "order-1" });

    expect(invoice.orderId).toBe("order-1");
    expect(invoicesRepository.items).toHaveLength(1);
    expect(invoicesRepository.items[0]).toBe(invoice);
  });
});
