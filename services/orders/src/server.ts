import "@opentelemetry/auto-instrumentations-node/register";

import { CreateOrderUseCase } from "./application/use-cases/create-order.ts";
import { DrizzleCustomersRepository } from "./infra/db/repositories/drizzle-customers-repository.ts";
import { DrizzleOrdersRepository } from "./infra/db/repositories/drizzle-orders-repository.ts";
import { db } from "./infra/db/client.ts";
import { RabbitMQOrderEventsPublisher } from "./infra/messaging/publisher/rabbitmq-order-events-publisher.ts";
import { ordersChannel } from "./infra/messaging/channels/orders.ts";
import { buildApp } from "./infra/http/app.ts";

// Adapters de sáida
const customersRepository = new DrizzleCustomersRepository(db);
const ordersRepository = new DrizzleOrdersRepository(db);
const orderEventsPublisher = new RabbitMQOrderEventsPublisher(ordersChannel);

// Use cases
const createOrder = new CreateOrderUseCase(
  customersRepository,
  ordersRepository,
  orderEventsPublisher,
);

// Adapter de entrada
const app = buildApp({ createOrder });

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3333) })
  .then(() => {
    console.log("[Orders] HTTP Server running !");
  });
