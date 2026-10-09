import { broker } from "../client.ts";
import { setupOrderQueues } from "../topology.ts";

export const ordersChannel = await broker.createChannel();

ordersChannel.on("error", (error) => {
  console.error("RabbitMQ channel error", error);
});

export const orderQueues = await setupOrderQueues(ordersChannel);
