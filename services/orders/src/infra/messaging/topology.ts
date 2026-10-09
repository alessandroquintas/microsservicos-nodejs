import type { Channel } from "amqplib";
import {
  EVENTS_EXCHANGE,
  PAYMENT_APPROVED_ROUTING_KEY,
  PAYMENT_FAILED_ROUTING_KEY,
} from "@microservices/contracts";
import { declareConsumerQueues } from "@microservices/messaging";

export const PAYMENT_APPROVED_QUEUE = "orders.payment-approved";
export const PAYMENT_FAILED_QUEUE = "orders.payment-failed";

const RETRY_DELAY_MS = 5000;

type TopologyChannel = Pick<
  Channel,
  "assertExchange" | "assertQueue" | "bindQueue"
>;

export async function setupTopology(channel: TopologyChannel) {
  const paymentApproved = await declareConsumerQueues(channel, {
    exchange: EVENTS_EXCHANGE,
    queue: PAYMENT_APPROVED_QUEUE,
    routingKeys: [PAYMENT_APPROVED_ROUTING_KEY],
    retryDelayMs: RETRY_DELAY_MS,
  });

  const paymentFailed = await declareConsumerQueues(channel, {
    exchange: EVENTS_EXCHANGE,
    queue: PAYMENT_FAILED_QUEUE,
    routingKeys: [PAYMENT_FAILED_ROUTING_KEY],
    retryDelayMs: RETRY_DELAY_MS,
  });

  return { paymentApproved, paymentFailed };
}
