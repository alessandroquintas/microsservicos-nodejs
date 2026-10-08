import { broker } from "../client.ts";

export const ordersChannel = await broker.createConfirmChannel();

await ordersChannel.assertQueue("orders-queue");
