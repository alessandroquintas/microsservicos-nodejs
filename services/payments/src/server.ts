import "@opentelemetry/auto-instrumentations-node/register";

import { buildApp } from "./infra/http/app.ts";
import { createUseCases } from "./bootstrap/use-cases.ts";
import { startConsumers, startOutboxRelay } from "./bootstrap/messaging.ts";
import { closeConnections } from "./bootstrap/connections.ts";
import { registerGracefulShutdown } from "./bootstrap/graceful-shutdown.ts";

const useCases = createUseCases();
const consumers = await startConsumers(useCases);
const outboxRelay = startOutboxRelay();
const app = buildApp();

app
  .listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3335) })
  .then(() => {
    console.log("[Payments] HTTP Server running !");
  });

registerGracefulShutdown("Payments", [
  () => consumers.stop(),
  () => app.close(),
  () => outboxRelay.stop(),
  closeConnections,
]);
