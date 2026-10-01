import "@opentelemetry/auto-instrumentations-node/register";

import { app } from "./http/app.ts";

app.listen({ host: "0.0.0.0", port: 3333 }).then(() => {
  console.log("[Orders] HTTP Server running !");
});
