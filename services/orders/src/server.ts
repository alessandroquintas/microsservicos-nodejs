import "@opentelemetry/auto-instrumentations-node/register";

import { buildApp } from "./infra/http/app.ts";
import { createUseCases } from "./bootstrap/use-cases.ts";
import { startConsumers, startOutboxRelay } from "./bootstrap/messaging.ts";
import { closeConnections } from "./bootstrap/connections.ts";
import { registerGracefulShutdown } from "./bootstrap/graceful-shutdown.ts";

const useCases = createUseCases();
const app = buildApp(useCases);
const consumers = await startConsumers(useCases);
const outboxRelay = startOutboxRelay();

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3333) })
  .then(() => {
    console.log("[Orders] HTTP Server running !");
  });

registerGracefulShutdown("Orders", [
  () => consumers.stop(),
  () => app.close(),
  () => outboxRelay.stop(),
  closeConnections,
]);
