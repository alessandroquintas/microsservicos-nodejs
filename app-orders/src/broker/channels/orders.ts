import { broker } from "../client.ts";

export const ordersChannel = await broker.createChannel();

await ordersChannel.assertQueue("orders-queue");
