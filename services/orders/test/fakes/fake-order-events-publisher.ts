import type { OrderCreatedMessage } from "@microservices/contracts";
import type { OrderEventsPublisher } from "../../src/application/ports/order-events-publisher.ts";

export class FakeOrderEventsPublisher implements OrderEventsPublisher {
  published: OrderCreatedMessage[] = [];

  async publishOrderCreated(message: OrderCreatedMessage): Promise<void> {
    this.published.push(message);
  }
}
