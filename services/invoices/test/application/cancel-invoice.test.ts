import { beforeEach, describe, expect, it } from "vitest";
import { CancelInvoiceUseCase } from "../../src/application/use-cases/cancel-invoice.ts";
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
let sut: CancelInvoiceUseCase;
let invoice: InvoiceEntity;

beforeEach(() => {
  invoicesRepository = new InMemoryInvoicesRepository();
  sut = new CancelInvoiceUseCase(invoicesRepository);

  invoice = InvoiceEntity.create({
    orderId: "order-1",
    amount: Money.fromCents(1050),
    customer: { id: "customer-1", name: "John Doe", email: "john@example.com" },
  });
  invoicesRepository.items.push(invoice);
});

describe("CancelInvoiceUseCase", () => {
  it("cancels the open invoice of the order", async () => {
    const result = await sut.execute({ orderId: "order-1" });

    expect(result.status).toBe(InvoiceStatus.CANCELED);
    expect(invoicesRepository.items[0].status).toBe(InvoiceStatus.CANCELED);
  });

  it("is idempotent", async () => {
    await sut.execute({ orderId: "order-1" });
    const result = await sut.execute({ orderId: "order-1" });

    expect(result.status).toBe(InvoiceStatus.CANCELED);
    expect(invoicesRepository.items).toHaveLength(1);
  });

  it("fails when the order has no invoice yet", async () => {
    await expect(sut.execute({ orderId: "order-2" })).rejects.toThrow(
      InvoiceNotFoundError,
    );
  });

  it("does not cancel a paid invoice", async () => {
    invoice.markAsPaid();

    await expect(sut.execute({ orderId: "order-1" })).rejects.toThrow(
      InvalidInvoiceStatusTransitionError,
    );
    expect(invoicesRepository.items[0].status).toBe(InvoiceStatus.PAID);
  });
});
