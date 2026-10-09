import type {
  OrderCanceledMessage,
  OrderCreatedMessage,
} from "@microservices/contracts";

export interface OrderEventsPublisher {
  publishOrderCreated(message: OrderCreatedMessage): Promise<void>;
  publishOrderCanceled(message: OrderCanceledMessage): Promise<void>;
}
