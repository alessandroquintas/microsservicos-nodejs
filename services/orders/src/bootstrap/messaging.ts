import { EVENTS_EXCHANGE } from "@microservices/contracts";
import {
  OutboxRelay,
  startConsumer,
  type Consumer,
} from "@microservices/messaging";
import { db } from "../infra/db/client.ts";
import { DrizzleOutboxStore } from "../infra/db/outbox/drizzle-outbox-store.ts";
import { ordersChannel } from "../infra/messaging/channels/orders.ts";
import {
  paymentQueues,
  paymentsChannel,
} from "../infra/messaging/channels/payments.ts";
import { createPaymentApprovedHandler } from "../infra/messaging/handlers/payment-approved.handler.ts";
import { createPaymentFailedHandler } from "../infra/messaging/handlers/payment-failed.handler.ts";
import { ROUTING_KEY_BY_EVENT_TYPE } from "../infra/messaging/routing-keys.ts";
import type { UseCases } from "./use-cases.ts";

const MAX_RETRIES = 3;

// Inicia todos os consumers; o stop() os encerra na ordem em que subiram.
export async function startConsumers(
  useCases: Pick<UseCases, "markOrderAsPaid" | "cancelOrder">,
): Promise<Consumer> {
  const consumers = [
    await startConsumer(
      paymentsChannel,
      { ...paymentQueues.paymentApproved, maxRetries: MAX_RETRIES },
      createPaymentApprovedHandler(useCases.markOrderAsPaid),
    ),
    await startConsumer(
      paymentsChannel,
      { ...paymentQueues.paymentFailed, maxRetries: MAX_RETRIES },
      createPaymentFailedHandler(useCases.cancelOrder),
    ),
  ];

  return {
    async stop() {
      for (const consumer of consumers) {
        await consumer.stop();
      }
    },
  };
}

export function startOutboxRelay() {
  const outboxRelay = new OutboxRelay(
    new DrizzleOutboxStore(db),
    ordersChannel,
    { exchange: EVENTS_EXCHANGE, routingKeys: ROUTING_KEY_BY_EVENT_TYPE },
  );
  outboxRelay.start();

  return outboxRelay;
}
