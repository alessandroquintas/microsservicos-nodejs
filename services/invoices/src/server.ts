import "@opentelemetry/auto-instrumentations-node/register";

import { EVENTS_EXCHANGE } from "@microservices/contracts";
import { OutboxRelay, startConsumer } from "@microservices/messaging";
import { buildApp } from "./infra/http/app.ts";
import { CreateInvoiceFromOrderUseCase } from "./application/use-cases/create-invoice-from-order.ts";
import { MarkInvoiceAsPaidUseCase } from "./application/use-cases/mark-invoice-as-paid.ts";
import { CancelInvoiceUseCase } from "./application/use-cases/cancel-invoice.ts";
import { GetInvoiceUseCase } from "./application/use-cases/get-invoice.ts";
import { ListInvoicesUseCase } from "./application/use-cases/list-invoices.ts";
import { DrizzleInvoicesQuery } from "./infra/db/queries/drizzle-invoices-query.ts";
import { DrizzleInvoicesRepository } from "./infra/db/repositories/drizzle-invoices-repository.ts";
import { DrizzleUnitOfWork } from "./infra/db/drizzle-unit-of-work.ts";
import { DrizzleOutboxStore } from "./infra/db/outbox/drizzle-outbox-store.ts";
import { db } from "./infra/db/client.ts";
import {
  orderQueues,
  ordersChannel,
} from "./infra/messaging/channels/orders.ts";
import {
  paymentQueues,
  paymentsChannel,
} from "./infra/messaging/channels/payments.ts";
import { invoicesChannel } from "./infra/messaging/channels/invoices.ts";
import {
  broker,
  markBrokerShuttingDown,
} from "./infra/messaging/client.ts";
import { createOrderCreatedHandler } from "./infra/messaging/handlers/order-created.handler.ts";
import { createPaymentApprovedHandler } from "./infra/messaging/handlers/payment-approved.handler.ts";
import { createOrderCanceledHandler } from "./infra/messaging/handlers/order-canceled.handler.ts";
import { ROUTING_KEY_BY_EVENT_TYPE } from "./infra/messaging/routing-keys.ts";
// Adapters de saída
const invoicesRepository = new DrizzleInvoicesRepository(db);
const unitOfWork = new DrizzleUnitOfWork(db);
const invoicesQuery = new DrizzleInvoicesQuery(db);

// UseCases
const createInvoiceFromOrder = new CreateInvoiceFromOrderUseCase(
  invoicesRepository,
  unitOfWork,
);
const markInvoiceAsPaid = new MarkInvoiceAsPaidUseCase(invoicesRepository);
const cancelInvoice = new CancelInvoiceUseCase(invoicesRepository);
const getInvoice = new GetInvoiceUseCase(invoicesQuery);
const listInvoices = new ListInvoicesUseCase(invoicesQuery);

// Adapters de entrada
const orderCreatedConsumer = await startConsumer(
  ordersChannel,
  {
    queue: orderQueues.orderCreated.queue,
    deadLetterQueue: orderQueues.orderCreated.deadLetterQueue,
    maxRetries: 3,
  },
  createOrderCreatedHandler(createInvoiceFromOrder),
);

const orderCanceledConsumer = await startConsumer(
  ordersChannel,
  {
    queue: orderQueues.orderCanceled.queue,
    deadLetterQueue: orderQueues.orderCanceled.deadLetterQueue,
    maxRetries: 3,
  },
  createOrderCanceledHandler(cancelInvoice),
);

const paymentApprovedConsumer = await startConsumer(
  paymentsChannel,
  {
    queue: paymentQueues.paymentApproved.queue,
    deadLetterQueue: paymentQueues.paymentApproved.deadLetterQueue,
    maxRetries: 3,
  },
  createPaymentApprovedHandler(markInvoiceAsPaid),
);

const outboxRelay = new OutboxRelay(
  new DrizzleOutboxStore(db),
  invoicesChannel,
  { exchange: EVENTS_EXCHANGE, routingKeys: ROUTING_KEY_BY_EVENT_TYPE },
);
outboxRelay.start();

const app = buildApp({ getInvoice, listInvoices });

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3334) })
  .then(() => {
    console.log("[Invoices] HTTP Server running !");
  });

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[Invoices] ${signal} received, shutting down`);

  setTimeout(() => {
    console.error("[Invoices] Forced shutdown");
    process.exit(1);
  }, 10_000).unref();

  await orderCreatedConsumer.stop();
  await orderCanceledConsumer.stop();
  await paymentApprovedConsumer.stop();
  await app.close();
  await outboxRelay.stop();
  markBrokerShuttingDown();
  await ordersChannel.close();
  await paymentsChannel.close();
  await invoicesChannel.close();
  await broker.close();
  await db.$client.end();

  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
