import type {
  UnitOfWork,
  UnitOfWorkContext,
} from "../../src/application/ports/unit-of-work.ts";
import type { FakePaymentEventsPublisher } from "./fake-payment-events-publisher.ts";
import type { InMemoryPaymentsRepository } from "./in-memory-payments-repository.ts";

export class InMemoryUnitOfWork implements UnitOfWork {
  #payments: InMemoryPaymentsRepository;
  #paymentEvents: FakePaymentEventsPublisher;

  constructor(
    payments: InMemoryPaymentsRepository,
    paymentEvents: FakePaymentEventsPublisher,
  ) {
    this.#payments = payments;
    this.#paymentEvents = paymentEvents;
  }

  async run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return work({
      payments: this.#payments,
      paymentEvents: this.#paymentEvents,
    });
  }
}
