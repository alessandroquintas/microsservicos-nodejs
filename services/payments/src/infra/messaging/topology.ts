import type { Channel } from "amqplib";
import {
  EVENTS_EXCHANGE,
  INVOICE_CREATED_ROUTING_KEY,
} from "@microservices/contracts";
import { declareConsumerQueues } from "@microservices/messaging";

export const INVOICE_CREATED_QUEUE = "payments.invoice-created";

const RETRY_DELAY_MS = 5000;

type TopologyChannel = Pick<
  Channel,
  "assertExchange" | "assertQueue" | "bindQueue"
>;

export async function setupTopology(channel: TopologyChannel) {
  return declareConsumerQueues(channel, {
    exchange: EVENTS_EXCHANGE,
    queue: INVOICE_CREATED_QUEUE,
    routingKeys: [INVOICE_CREATED_ROUTING_KEY],
    retryDelayMs: RETRY_DELAY_MS,
  });
}
