import amqp from "amqplib";
import { connectWithRetry } from "./connect-with-retry.ts";

const BROKER_URL = process.env.BROKER_URL;

if (!BROKER_URL) {
  throw new Error("BROKER_URL must be configured.");
}

let shuttingDown = false;

export function markBrokerShuttingDown() {
  shuttingDown = true;
}

export const broker = await connectWithRetry(() => amqp.connect(BROKER_URL));

broker.on("error", (error) => {
  console.error("RabbitMQ connection error", error);
});

broker.on("close", () => {
  if (shuttingDown) return;

  console.error("RabbitMQ connection lost, exiting");
  process.exit(1);
});
