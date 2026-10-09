import "@opentelemetry/auto-instrumentations-node/register";

import { CreateOrderUseCase } from "./application/use-cases/create-order.ts";
import { CreateCustomerUseCase } from "./application/use-cases/create-customer.ts";
import { GetCustomerUseCase } from "./application/use-cases/get-customer.ts";
import { GetOrderUseCase } from "./application/use-cases/get-order.ts";
import { ListOrdersUseCase } from "./application/use-cases/list-orders.ts";
import { MarkOrderAsPaidUseCase } from "./application/use-cases/mark-order-as-paid.ts";
import { CancelOrderUseCase } from "./application/use-cases/cancel-order.ts";
import { DrizzleOrdersQuery } from "./infra/db/queries/drizzle-orders-query.ts";
import { DrizzleCustomersRepository } from "./infra/db/repositories/drizzle-customers-repository.ts";
import { DrizzleOrdersRepository } from "./infra/db/repositories/drizzle-orders-repository.ts";
import { db } from "./infra/db/client.ts";
import { buildApp } from "./infra/http/app.ts";
import { DrizzleUnitOfWork } from "./infra/db/drizzle-unit-of-work.ts";
import { EVENTS_EXCHANGE } from "@microservices/contracts";
import { OutboxRelay, startConsumer } from "@microservices/messaging";
import { DrizzleOutboxStore } from "./infra/db/outbox/drizzle-outbox-store.ts";
import { ROUTING_KEY_BY_EVENT_TYPE } from "./infra/messaging/routing-keys.ts";
import { ordersChannel } from "./infra/messaging/channels/orders.ts";
import {
  paymentQueues,
  paymentsChannel,
} from "./infra/messaging/channels/payments.ts";
import { createPaymentApprovedHandler } from "./infra/messaging/handlers/payment-approved.handler.ts";
import { createPaymentFailedHandler } from "./infra/messaging/handlers/payment-failed.handler.ts";
import {
  broker,
  markBrokerShuttingDown,
} from "./infra/messaging/client.ts";

// Adapters de sáida
const customersRepository = new DrizzleCustomersRepository(db);
const ordersRepository = new DrizzleOrdersRepository(db);
const unitOfWork = new DrizzleUnitOfWork(db);
const ordersQuery = new DrizzleOrdersQuery(db);

// Use cases
const createOrder = new CreateOrderUseCase(customersRepository, unitOfWork);
const createCustomer = new CreateCustomerUseCase(customersRepository);
const getCustomer = new GetCustomerUseCase(customersRepository);
const getOrder = new GetOrderUseCase(ordersQuery);
const listOrders = new ListOrdersUseCase(ordersQuery);
const markOrderAsPaid = new MarkOrderAsPaidUseCase(ordersRepository);
const cancelOrder = new CancelOrderUseCase(ordersRepository, unitOfWork);

// Adapters de entrada
const app = buildApp({
  createOrder,
  createCustomer,
  getCustomer,
  getOrder,
  listOrders,
  cancelOrder,
});

const paymentApprovedConsumer = await startConsumer(
  paymentsChannel,
  {
    queue: paymentQueues.paymentApproved.queue,
    deadLetterQueue: paymentQueues.paymentApproved.deadLetterQueue,
    maxRetries: 3,
  },
  createPaymentApprovedHandler(markOrderAsPaid),
);

const paymentFailedConsumer = await startConsumer(
  paymentsChannel,
  {
    queue: paymentQueues.paymentFailed.queue,
    deadLetterQueue: paymentQueues.paymentFailed.deadLetterQueue,
    maxRetries: 3,
  },
  createPaymentFailedHandler(cancelOrder),
);

const outboxRelay = new OutboxRelay(new DrizzleOutboxStore(db), ordersChannel, {
  exchange: EVENTS_EXCHANGE,
  routingKeys: ROUTING_KEY_BY_EVENT_TYPE,
});
outboxRelay.start();

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3333) })
  .then(() => {
    console.log("[Orders] HTTP Server running !");
  });

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`[Orders] ${signal} received, shutting down`);

  setTimeout(() => {
    console.error("[Orders] Forced shutdown");
    process.exit(1);
  }, 10_000).unref();

  await paymentApprovedConsumer.stop();
  await paymentFailedConsumer.stop();
  await app.close();
  await outboxRelay.stop();
  markBrokerShuttingDown();
  await paymentsChannel.close();
  await ordersChannel.close();
  await broker.close();
  await db.$client.end();

  process.exit(0);
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
