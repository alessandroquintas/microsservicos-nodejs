import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryInvoicesRepository } from "../fakes/in-memory-invoices-repository.ts";
import { CreateInvoiceFromOrderUseCase } from "../../src/application/use-cases/create-invoice-from-order.ts";

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

  it("does not create a second invoice for the same orderId", async () => {
    const first = await sut.execute({ orderId: "order-1" });
    const second = await sut.execute({ orderId: "order-1" });

    expect(second.id).toBe(first.id);
    expect(invoicesRepository.items).toHaveLength(1);
  });
});
