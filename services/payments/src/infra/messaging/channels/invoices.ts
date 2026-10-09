import { broker } from "../client.ts";
import { setupTopology } from "../topology.ts";

export const invoicesChannel = await broker.createChannel();

invoicesChannel.on("error", (error) => {
  console.error("RabbitMQ channel error", error);
});

export const invoiceCreatedQueues = await setupTopology(invoicesChannel);
