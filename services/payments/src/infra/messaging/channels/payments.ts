import { EVENTS_EXCHANGE } from "@microservices/contracts";
import { broker } from "../client.ts";

export const paymentsChannel = await broker.createConfirmChannel();

paymentsChannel.on("error", (error) => {
  console.error("RabbitMQ channel error", error);
});

await paymentsChannel.assertExchange(EVENTS_EXCHANGE, "topic", {
  durable: true,
});
