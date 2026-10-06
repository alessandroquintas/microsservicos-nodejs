import type {
  UnitOfWork,
  UnitOfWorkContext,
} from "../../src/application/ports/unit-of-work.ts";
import type { FakeOrderEventsPublisher } from "./fake-order-events-publisher.ts";
import type { InMemoryOrdersRepository } from "./in-memory-orders-repository.ts";

export class InMemoryUnitOfWork implements UnitOfWork {
  #orders: InMemoryOrdersRepository;
  #orderEvents: FakeOrderEventsPublisher;

  constructor(
    orders: InMemoryOrdersRepository,
    orderEvents: FakeOrderEventsPublisher,
  ) {
    this.#orders = orders;
    this.#orderEvents = orderEvents;
  }

  async run<T>(work: (context: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return work({
      orders: this.#orders,
      orderEvents: this.#orderEvents,
    });
  }
}
