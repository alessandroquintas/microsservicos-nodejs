import type { Channel } from "amqplib";
import {
  EVENTS_EXCHANGE,
  ORDER_CREATED_ROUTING_KEY,
} from "@microservices/contracts";

export const ORDER_CREATED_QUEUE = "invoices.order-created";
export const ORDER_CREATED_RETRY_QUEUE = "invoices.order-created.retry";
export const ORDER_CREATED_DLQ = "invoices.order-created.dlq";

type TopologyChannel = Pick<
  Channel,
  "assertExchange" | "assertQueue" | "bindQueue"
>;

export async function setupTopology(channel: TopologyChannel) {
  await channel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });

  await channel.assertQueue(ORDER_CREATED_QUEUE, {
    durable: true,
    deadLetterExchange: "",
    deadLetterRoutingKey: ORDER_CREATED_RETRY_QUEUE,
  });
  await channel.bindQueue(
    ORDER_CREATED_QUEUE,
    EVENTS_EXCHANGE,
    ORDER_CREATED_ROUTING_KEY,
  );

  await channel.assertQueue(ORDER_CREATED_RETRY_QUEUE, {
    durable: true,
    messageTtl: 5000,
    deadLetterExchange: "",
    deadLetterRoutingKey: ORDER_CREATED_QUEUE,
  });

  await channel.assertQueue(ORDER_CREATED_DLQ, { durable: true });
}
