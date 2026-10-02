import { ordersChannel } from "../channels/orders.ts";
import type { OrderCreatedMessage } from "../../../../../contracts/messages/order-created-message.ts";

export async function dispatchOrderCreated(data: OrderCreatedMessage) {
  ordersChannel.sendToQueue(
    "orders-queue",
    Buffer.from(JSON.stringify({ data })),
  );
}
