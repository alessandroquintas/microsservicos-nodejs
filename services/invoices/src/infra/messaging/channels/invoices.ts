import { EVENTS_EXCHANGE } from "@microservices/contracts";
import { broker } from "../client.ts";

export const invoicesChannel = await broker.createConfirmChannel();

invoicesChannel.on("error", (error) => {
  console.error("RabbitMQ channel error", error);
});

await invoicesChannel.assertExchange(EVENTS_EXCHANGE, "topic", {
  durable: true,
});
