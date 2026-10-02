import { ordersChannel } from "./channels/orders.ts";
import { handleOrderCreated } from "./handlers/order-created.handler.ts";

ordersChannel.consume(
  "orders-queue",
  async (message) => {
    if (!message) return;

    return handleOrderCreated(message, ordersChannel);
  },
  {
    noAck: false,
  },
);
