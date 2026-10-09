import { z } from "zod";

export const orderCanceledMessageSchema = z.object({
  orderId: z.uuid(),
  reason: z.string().min(1),
});

export type OrderCanceledMessage = z.infer<typeof orderCanceledMessageSchema>;

export const ORDER_CANCELED_EVENT = "OrderCanceled";

export const ORDER_CANCELED_ROUTING_KEY = "order.canceled";
