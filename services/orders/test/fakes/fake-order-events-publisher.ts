import type {
  OrderCanceledMessage,
  OrderCreatedMessage,
} from "@microservices/contracts";
import type { OrderEventsPublisher } from "../../src/application/ports/order-events-publisher.ts";

export class FakeOrderEventsPublisher implements OrderEventsPublisher {
  published: OrderCreatedMessage[] = [];
  canceled: OrderCanceledMessage[] = [];

  async publishOrderCreated(message: OrderCreatedMessage): Promise<void> {
    this.published.push(message);
  }

  async publishOrderCanceled(message: OrderCanceledMessage): Promise<void> {
    this.canceled.push(message);
  }
}
