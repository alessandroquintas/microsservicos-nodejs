import { broker } from "../client.ts";
import { setupTopology } from "../topology.ts";

export const paymentsChannel = await broker.createChannel();

paymentsChannel.on("error", (error) => {
  console.error("RabbitMQ channel error", error);
});

export const paymentQueues = await setupTopology(paymentsChannel);
