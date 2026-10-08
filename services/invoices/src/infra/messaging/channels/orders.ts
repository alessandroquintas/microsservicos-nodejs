import { broker } from "../client.ts";
import { setupTopology } from "../topology.ts";

export const ordersChannel = await broker.createChannel();

ordersChannel.on("error", (error) => {
  console.error("RabbitMQ channel error", error);
});

await setupTopology(ordersChannel);
