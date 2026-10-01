import { randomUUID } from "node:crypto";
import { db } from "../db/client.ts";
import { schema } from "../db/schema/index.ts";
import { ordersChannel } from "./channels/orders.ts";

ordersChannel.consume(
  "orders-queue",
  async (message) => {
    if (!message) {
      return null;
    }

    let payload: { data?: { orderId?: string } } | undefined;

    try {
      payload = JSON.parse(message.content.toString());
      const orderId = payload?.data?.orderId;
      const invoiceId = randomUUID();

      if (!orderId) {
        ordersChannel.nack(message, false, false); // não reenfileira
        return;
      }

      await db.insert(schema.invoices).values({ id: invoiceId, orderId });
      ordersChannel.ack(message);
    } catch (error) {
      console.error("Failed to process OrderCreated", {
        orderId: payload?.data?.orderId,
        error,
      });
      ordersChannel.nack(message, false, false); // não reenfileira
    }
  },
  {
    noAck: false,
  },
);
