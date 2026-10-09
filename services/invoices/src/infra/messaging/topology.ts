import type { Channel } from "amqplib";
import {
  EVENTS_EXCHANGE,
  ORDER_CANCELED_ROUTING_KEY,
  ORDER_CREATED_ROUTING_KEY,
  PAYMENT_APPROVED_ROUTING_KEY,
} from "@microservices/contracts";
import { declareConsumerQueues } from "@microservices/messaging";

export const ORDER_CREATED_QUEUE = "invoices.order-created";
export const ORDER_CANCELED_QUEUE = "invoices.order-canceled";
export const PAYMENT_APPROVED_QUEUE = "invoices.payment-approved";

const RETRY_DELAY_MS = 5000;

type TopologyChannel = Pick<
  Channel,
  "assertExchange" | "assertQueue" | "bindQueue"
>;

export async function setupOrderQueues(channel: TopologyChannel) {
  const orderCreated = await declareConsumerQueues(channel, {
    exchange: EVENTS_EXCHANGE,
    queue: ORDER_CREATED_QUEUE,
    routingKeys: [ORDER_CREATED_ROUTING_KEY],
    retryDelayMs: RETRY_DELAY_MS,
  });

  const orderCanceled = await declareConsumerQueues(channel, {
    exchange: EVENTS_EXCHANGE,
    queue: ORDER_CANCELED_QUEUE,
    routingKeys: [ORDER_CANCELED_ROUTING_KEY],
    retryDelayMs: RETRY_DELAY_MS,
  });

  return { orderCreated, orderCanceled };
}

export async function setupPaymentQueues(channel: TopologyChannel) {
  const paymentApproved = await declareConsumerQueues(channel, {
    exchange: EVENTS_EXCHANGE,
    queue: PAYMENT_APPROVED_QUEUE,
    routingKeys: [PAYMENT_APPROVED_ROUTING_KEY],
    retryDelayMs: RETRY_DELAY_MS,
  });

  return { paymentApproved };
}
