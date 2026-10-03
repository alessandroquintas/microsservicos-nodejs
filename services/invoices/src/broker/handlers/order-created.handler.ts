import type { Channel, ConsumeMessage } from "amqplib";
import { db } from "../../db/client.ts";
import { schema } from "../../db/schema/index.ts";
import { randomUUID } from "node:crypto";
import { orderCreatedMessageSchema } from "@microservices/contracts";

type AckChannel = Pick<Channel, "ack" | "nack">;

export async function handleOrderCreated(
  message: ConsumeMessage,
  channel: AckChannel,
) {
  let orderId: string | undefined;

  try {
    const payload = JSON.parse(message.content.toString());
    const result = orderCreatedMessageSchema.safeParse(payload?.data);

    if (!result.success) {
      console.warn("Invalid OrderCreated message, discarding", {
        issues: result.error.issues,
      });
      channel.nack(message, false, false);
      return;
    }

    orderId = result.data.orderId;

    await db.insert(schema.invoices).values({
      id: randomUUID(),
      orderId: orderId,
    });
    channel.ack(message);
  } catch (error) {
    console.error("Failed to process OrderCreated", { orderId, error });
    channel.nack(message, false, false);
  }
}
