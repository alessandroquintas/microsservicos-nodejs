import type { Channel, ConsumeMessage } from "amqplib";

type MessageHandler = (
  message: ConsumeMessage,
  channel: Channel,
) => Promise<void>;

export function startOrderCreatedConsumer(
  channel: Channel,
  handler: MessageHandler,
) {
  return channel.consume(
    "orders-queue",
    async (message) => {
      if (!message) return;
      return handler(message, channel);
    },
    { noAck: false },
  );
}
