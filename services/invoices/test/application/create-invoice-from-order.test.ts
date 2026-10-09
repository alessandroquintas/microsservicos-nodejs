import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryInvoicesRepository } from "../fakes/in-memory-invoices-repository.ts";
import { FakeInvoiceEventsPublisher } from "../fakes/fake-invoice-events-publisher.ts";
import { InMemoryUnitOfWork } from "../fakes/in-memory-unit-of-work.ts";
import { CreateInvoiceFromOrderUseCase } from "../../src/application/use-cases/create-invoice-from-order.ts";
import { InvoiceStatus } from "../../src/domain/invoice/invoice-entity.ts";
import { InvalidInvoiceAmountError } from "../../src/domain/invoice/errors.ts";

const customer = {
  id: randomUUID(),
  name: "John Doe",
  email: "johndoe@example.com",
};

let invoicesRepository: InMemoryInvoicesRepository;
let invoiceEventsPublisher: FakeInvoiceEventsPublisher;
let sut: CreateInvoiceFromOrderUseCase;

beforeEach(() => {
  invoicesRepository = new InMemoryInvoicesRepository();
  invoiceEventsPublisher = new FakeInvoiceEventsPublisher();
  sut = new CreateInvoiceFromOrderUseCase(
    invoicesRepository,
    new InMemoryUnitOfWork(invoicesRepository, invoiceEventsPublisher),
  );
});

describe("CreateInvoiceFromOrderUseCase", () => {
  it("creates and saves an open invoice for the order", async () => {
    const invoice = await sut.execute({
      orderId: "order-1",
      amountInCents: 1050,
      customer,
    });

    expect(invoice.orderId).toBe("order-1");
    expect(invoice.amount.cents).toBe(1050);
    expect(invoice.status).toBe(InvoiceStatus.OPEN);
    expect(invoice.customer).toEqual(customer);
    expect(invoicesRepository.items).toEqual([invoice]);
  });

  it("publishes InvoiceCreated", async () => {
    const invoice = await sut.execute({
      orderId: "order-1",
      amountInCents: 1050,
      customer,
    });

    expect(invoiceEventsPublisher.published).toEqual([
      {
        invoiceId: invoice.id,
        orderId: "order-1",
        amount: 1050,
        customer,
        dueDate: invoice.dueDate.toISOString(),
      },
    ]);
  });

  it("does not create nor publish again for an order already invoiced", async () => {
    const args = { orderId: "order-1", amountInCents: 1050, customer };

    const first = await sut.execute(args);
    const second = await sut.execute(args);

    expect(second.id).toBe(first.id);
    expect(invoicesRepository.items).toHaveLength(1);
    expect(invoiceEventsPublisher.published).toHaveLength(1);
  });

  it("does not publish when a concurrent delivery invoiced the order first", async () => {
    const args = { orderId: "order-1", amountInCents: 1050, customer };

    const [first, second] = await Promise.all([
      sut.execute(args),
      sut.execute(args),
    ]);

    expect(second.id).toBe(first.id);
    expect(invoicesRepository.items).toHaveLength(1);
    expect(invoiceEventsPublisher.published).toHaveLength(1);
  });

  it("rejects a zero amount", async () => {
    await expect(
      sut.execute({ orderId: "order-1", amountInCents: 0, customer }),
    ).rejects.toThrow(InvalidInvoiceAmountError);

    expect(invoicesRepository.items).toHaveLength(0);
    expect(invoiceEventsPublisher.published).toHaveLength(0);
  });
});
