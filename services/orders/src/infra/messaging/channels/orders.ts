import { EVENTS_EXCHANGE } from "@microservices/contracts";
import { broker } from "../client.ts";

export const ordersChannel = await broker.createConfirmChannel();

ordersChannel.on("error", (error) => {
  console.error("RabbitMQ channel error", error);
});

await ordersChannel.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
