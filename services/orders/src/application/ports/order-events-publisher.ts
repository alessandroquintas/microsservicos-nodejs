import type { OrderCreatedMessage } from "@microservices/contracts";

export interface OrderEventsPublisher {
  publishOrderCreated(message: OrderCreatedMessage): Promise<void>;
}
