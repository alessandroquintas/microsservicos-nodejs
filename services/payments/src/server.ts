import "@opentelemetry/auto-instrumentations-node/register";

import { EVENTS_EXCHANGE } from "@microservices/contracts";
import { OutboxRelay, startConsumer } from "@microservices/messaging";
import { buildApp } from "./infra/http/app.ts";
import { ProcessPaymentUseCase } from "./application/use-cases/process-payment.ts";
import { DrizzlePaymentsRepository } from "./infra/db/repositories/drizzle-payments-repository.ts";
import { DrizzleUnitOfWork } from "./infra/db/drizzle-unit-of-work.ts";
import { DrizzleOutboxStore } from "./infra/db/outbox/drizzle-outbox-store.ts";
import { db } from "./infra/db/client.ts";
import { FakePaymentGateway } from "./infra/gateway/fake-payment-gateway.ts";
import {
  invoiceCreatedQueues,
  invoicesChannel,
} from "./infra/messaging/channels/invoices.ts";
import { paymentsChannel } from "./infra/messaging/channels/payments.ts";
import {
  broker,
  markBrokerShuttingDown,
} from "./infra/messaging/client.ts";
import { createInvoiceCreatedHandler } from "./infra/messaging/handlers/invoice-created.handler.ts";
import { ROUTING_KEY_BY_EVENT_TYPE } from "./infra/messaging/routing-keys.ts";

// Adapters de saída
const paymentsRepository = new DrizzlePaymentsRepository(db);
const unitOfWork = new DrizzleUnitOfWork(db);
const paymentGateway = new FakePaymentGateway({
  approvalRate: Number(process.env.PAYMENT_APPROVAL_RATE ?? 0.8),
});

// UseCases
const processPayment = new ProcessPaymentUseCase(
  paymentsRepository,
  paymentGateway,
  unitOfWork,
);

// Adapters de entrada
const handleInvoiceCreated = createInvoiceCreatedHandler(processPayment);
const consumer = await startConsumer(
  invoicesChannel,
  {
    queue: invoiceCreatedQueues.queue,
    deadLetterQueue: invoiceCreatedQueues.deadLetterQueue,
    maxRetries: 3,
  },
  handleInvoiceCreated,
);

const outboxRelay = new OutboxRelay(
  new DrizzleOutboxStore(db),
  paymentsChannel,
  { exchange: EVENTS_EXCHANGE, routingKeys: ROUTING_KEY_BY_EVENT_TYPE },
);
outboxRelay.start();

const app = buildApp();

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3335) })
  .then(() => {
    console.log("[Payments] HTTP Server running !");
  });

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[Payments] ${signal} received, shutting down`);

  setTimeout(() => {
    console.error("[Payments] Forced shutdown");
    process.exit(1);
  }, 10_000).unref();

  await consumer.stop();
  await app.close();
  await outboxRelay.stop();
  markBrokerShuttingDown();
  await invoicesChannel.close();
  await paymentsChannel.close();
  await broker.close();
  await db.$client.end();

  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
