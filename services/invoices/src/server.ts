import "@opentelemetry/auto-instrumentations-node/register";

import { app } from "./http/app.ts";
import "./broker/subscriber.ts";

app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3334) }).then(() => {
  console.log("[Invoices] HTTP Server running !");
});
