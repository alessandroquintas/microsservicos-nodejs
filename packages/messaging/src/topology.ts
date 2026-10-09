import type { Channel } from "amqplib";

type TopologyChannel = Pick<
  Channel,
  "assertExchange" | "assertQueue" | "bindQueue"
>;

type ConsumerQueuesOptions = {
  exchange: string;
  queue: string;
  routingKeys: string[];
  retryDelayMs: number;
};

export type ConsumerQueues = {
  queue: string;
  retryQueue: string;
  deadLetterQueue: string;
};

// Fila principal ligada à exchange topic, fila <queue>.retry (TTL, sem
// consumidor, devolve para a principal) e <queue>.dlq. Um nack sem requeue na
// principal manda a mensagem para a retry.
export async function declareConsumerQueues(
  channel: TopologyChannel,
  options: ConsumerQueuesOptions,
): Promise<ConsumerQueues> {
  const { exchange, queue, routingKeys, retryDelayMs } = options;
  const retryQueue = `${queue}.retry`;
  const deadLetterQueue = `${queue}.dlq`;

  await channel.assertExchange(exchange, "topic", { durable: true });

  await channel.assertQueue(queue, {
    durable: true,
    deadLetterExchange: "",
    deadLetterRoutingKey: retryQueue,
  });

  for (const routingKey of routingKeys) {
    await channel.bindQueue(queue, exchange, routingKey);
  }

  await channel.assertQueue(retryQueue, {
    durable: true,
    messageTtl: retryDelayMs,
    deadLetterExchange: "",
    deadLetterRoutingKey: queue,
  });

  await channel.assertQueue(deadLetterQueue, { durable: true });

  return { queue, retryQueue, deadLetterQueue };
}
