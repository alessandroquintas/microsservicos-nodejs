import { ordersChannel } from "./channels/orders.ts";

ordersChannel.consume(
  "orders-queue",
  async (message) => {
    if (!message) {
      return null;
    }

    console.log(message?.content.toString());

    ordersChannel.ack(message);
  },
  {
    noAck: false,
  },
);
