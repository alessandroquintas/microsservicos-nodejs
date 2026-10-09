import type {
  UnitOfWork,
  UnitOfWorkContext,
} from "../../src/application/ports/unit-of-work.ts";
import type { FakeInvoiceEventsPublisher } from "./fake-invoice-events-publisher.ts";
import type { InMemoryInvoicesRepository } from "./in-memory-invoices-repository.ts";

export class InMemoryUnitOfWork implements UnitOfWork {
  #invoices: InMemoryInvoicesRepository;
  #invoiceEvents: FakeInvoiceEventsPublisher;

  constructor(
    invoices: InMemoryInvoicesRepository,
    invoiceEvents: FakeInvoiceEventsPublisher,
  ) {
    this.#invoices = invoices;
    this.#invoiceEvents = invoiceEvents;
  }

  async run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return work({
      invoices: this.#invoices,
      invoiceEvents: this.#invoiceEvents,
    });
  }
}
