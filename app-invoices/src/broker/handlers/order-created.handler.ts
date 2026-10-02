import type { Channel, ConsumeMessage } from "amqplib";
import { db } from "../../db/client.ts";
import { schema } from "../../db/schema/index.ts";
import { randomUUID } from "node:crypto";

type AckChannel = Pick<Channel, "ack" | "nack">;

export async function handleOrderCreated(
  message: ConsumeMessage,
  channel: AckChannel,
) {
  let payload: { data?: { orderId?: string } } | undefined;

  try {
    payload = JSON.parse(message.content.toString());
    const orderId = payload?.data?.orderId;

    if (!orderId) {
      console.warn("OrderCreated without orderId discarding", { payload });
      channel.nack(message, false, false);
      return;
    }

    await db.insert(schema.invoices).values({
      id: randomUUID(),
      orderId: orderId,
    });
    channel.ack(message);
  } catch (error) {
    console.error("Failed to process OrderCreated", {
      orderId: payload?.data?.orderId,
      error,
    });
    channel.nack(message, false, false);
  }
}
