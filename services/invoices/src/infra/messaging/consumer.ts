import type { Channel, ConsumeMessage } from "amqplib";
import { InvalidMessageError } from "./errors.ts";

type ConsumerChannel = Pick<
  Channel,
  "consume" | "ack" | "nack" | "sendToQueue" | "cancel"
>;

type ConsumerOptions = {
  queue: string;
  deadLetterQueue: string;
  maxRetries: number;
};

type MessageHandler = (message: ConsumeMessage) => Promise<void>;

type XDeathEntry = { queue?: string; reason?: string; count?: number };

function getRetryCount(message: ConsumeMessage, queue: string): number {
  const xDeath = message.properties.headers?.["x-death"] as
    | XDeathEntry[]
    | undefined;

  const entry = xDeath?.find(
    (death) => death.queue === queue && death.reason === "rejected",
  );

  return Number(entry?.count ?? 0);
}

export type Consumer = { stop(): Promise<void> };

export async function startConsumer(
  channel: ConsumerChannel,
  options: ConsumerOptions,
  handler: MessageHandler,
): Promise<Consumer> {
  const { queue, deadLetterQueue, maxRetries } = options;

  function sendToDeadLetterQueue(message: ConsumeMessage, error: unknown) {
    const lastError = error instanceof Error ? error.message : String(error);

    channel.sendToQueue(deadLetterQueue, message.content, {
      persistent: true,
      messageId: message.properties.messageId,
      headers: {
        ...message.properties.headers,
        "x-last-error": lastError,
      },
    });
    channel.ack(message);

    console.warn(`Message sent to ${deadLetterQueue}`, {
      messageId: message.properties.messageId,
      error: lastError,
    });
  }

  async function processMessage(message: ConsumeMessage) {
    try {
      await handler(message);
      channel.ack(message);
    } catch (error) {
      if (error instanceof InvalidMessageError) {
        sendToDeadLetterQueue(message, error);
        return;
      }

      const retryCount = getRetryCount(message, queue);

      if (retryCount < maxRetries) {
        console.warn(
          `Message processing failed, retry ${retryCount + 1}/${maxRetries}`,
          { messageId: message.properties.messageId, error },
        );
        channel.nack(message, false, false);
        return;
      }

      sendToDeadLetterQueue(message, error);
    }
  }

  const inFlight = new Set<Promise<void>>();

  const { consumerTag } = await channel.consume(
    queue,
    (message) => {
      if (!message) return;

      const processing = processMessage(message).finally(() => {
        inFlight.delete(processing);
      });
      inFlight.add(processing);
    },
    { noAck: false },
  );

  return {
    async stop() {
      await channel.cancel(consumerTag);
      await Promise.all(inFlight);
    },
  };
}
