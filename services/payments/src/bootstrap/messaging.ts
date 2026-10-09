import { EVENTS_EXCHANGE } from "@microservices/contracts";
import {
  OutboxRelay,
  startConsumer,
  type Consumer,
} from "@microservices/messaging";
import { db } from "../infra/db/client.ts";
import { DrizzleOutboxStore } from "../infra/db/outbox/drizzle-outbox-store.ts";
import {
  invoiceCreatedQueues,
  invoicesChannel,
} from "../infra/messaging/channels/invoices.ts";
import { paymentsChannel } from "../infra/messaging/channels/payments.ts";
import { createInvoiceCreatedHandler } from "../infra/messaging/handlers/invoice-created.handler.ts";
import { ROUTING_KEY_BY_EVENT_TYPE } from "../infra/messaging/routing-keys.ts";
import type { UseCases } from "./use-cases.ts";

const MAX_RETRIES = 3;

export async function startConsumers(
  useCases: Pick<UseCases, "processPayment">,
): Promise<Consumer> {
  return startConsumer(
    invoicesChannel,
    { ...invoiceCreatedQueues, maxRetries: MAX_RETRIES },
    createInvoiceCreatedHandler(useCases.processPayment),
  );
}

export function startOutboxRelay() {
  const outboxRelay = new OutboxRelay(
    new DrizzleOutboxStore(db),
    paymentsChannel,
    { exchange: EVENTS_EXCHANGE, routingKeys: ROUTING_KEY_BY_EVENT_TYPE },
  );
  outboxRelay.start();

  return outboxRelay;
}
