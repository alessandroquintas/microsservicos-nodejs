import { beforeEach, describe, expect, it } from "vitest";
import { MarkInvoiceAsPaidUseCase } from "../../src/application/use-cases/mark-invoice-as-paid.ts";
import {
  InvalidInvoiceStatusTransitionError,
  InvoiceNotFoundError,
} from "../../src/domain/invoice/errors.ts";
import {
  InvoiceEntity,
  InvoiceStatus,
} from "../../src/domain/invoice/invoice-entity.ts";
import { Money } from "../../src/domain/shared/money.ts";
import { InMemoryInvoicesRepository } from "../fakes/in-memory-invoices-repository.ts";

let invoicesRepository: InMemoryInvoicesRepository;
let sut: MarkInvoiceAsPaidUseCase;
let invoice: InvoiceEntity;

beforeEach(() => {
  invoicesRepository = new InMemoryInvoicesRepository();
  sut = new MarkInvoiceAsPaidUseCase(invoicesRepository);

  invoice = InvoiceEntity.create({
    orderId: "order-1",
    amount: Money.fromCents(1050),
    customer: { id: "customer-1", name: "John Doe", email: "john@example.com" },
  });
  invoicesRepository.items.push(invoice);
});

describe("MarkInvoiceAsPaidUseCase", () => {
  it("pays an open invoice", async () => {
    const result = await sut.execute({ invoiceId: invoice.id });

    expect(result.status).toBe(InvoiceStatus.PAID);
    expect(invoicesRepository.items[0].status).toBe(InvoiceStatus.PAID);
  });

  it("is idempotent", async () => {
    await sut.execute({ invoiceId: invoice.id });
    const result = await sut.execute({ invoiceId: invoice.id });

    expect(result.status).toBe(InvoiceStatus.PAID);
    expect(invoicesRepository.items).toHaveLength(1);
  });

  it("fails when the invoice does not exist", async () => {
    await expect(sut.execute({ invoiceId: "unknown" })).rejects.toThrow(
      InvoiceNotFoundError,
    );
  });

  it("does not pay a canceled invoice", async () => {
    invoice.cancel();

    await expect(sut.execute({ invoiceId: invoice.id })).rejects.toThrow(
      InvalidInvoiceStatusTransitionError,
    );
    expect(invoicesRepository.items[0].status).toBe(InvoiceStatus.CANCELED);
  });
});
