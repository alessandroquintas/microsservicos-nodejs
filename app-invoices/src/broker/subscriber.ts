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

    try {
      console.log(
        "[Message] Consumed from the orders service",
        JSON.parse(message.content.toString()),
      );

      const payload = JSON.parse(message.content.toString());
      const orderId = payload?.data?.orderId;

      if (!orderId) {
        console.error("[Invoices] Mensagem sem orderId, descartando.");
        ordersChannel.nack(message, false, false); // não reenfileira
        return;
      }

      const invoiceId = randomUUID();
      await db.insert(schema.invoices).values({ id: invoiceId, orderId });

      console.log(`[Invoices] Created invoices for orders ${orderId}`);
      ordersChannel.ack(message);
    } catch (error) {
      console.log(error);
    }
  },
  {
    noAck: false,
  },
);
