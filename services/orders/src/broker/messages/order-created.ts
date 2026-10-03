import { ordersChannel } from "../channels/orders.ts";
import {
  type OrderCreatedMessage,
  orderCreatedMessageSchema,
} from "@microservices/contracts";

export async function dispatchOrderCreated(data: OrderCreatedMessage) {
  const message = orderCreatedMessageSchema.parse(data);

  ordersChannel.sendToQueue(
    "orders-queue",
    Buffer.from(JSON.stringify({ data: message })),
  );
}
