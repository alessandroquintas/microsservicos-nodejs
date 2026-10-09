import { z } from "zod";
import { OrderStatus } from "../../../domain/order/order-entity.ts";

export const createOrderBodySchema = z.object({
  customerId: z.uuid(),
  amount: z.coerce.number().int().positive().describe("Valor em centavos"),
});

export const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(Object.values(OrderStatus)).optional(),
  customerId: z.uuid().optional(),
});

export const orderParamsSchema = z.object({ id: z.uuid() });

// Sem body, o Fastify entrega null.
export const cancelOrderBodySchema = z
  .object({ reason: z.string().trim().min(1).optional() })
  .nullish();

export const createOrderResponseSchema = z.object({ orderId: z.string() });

export const orderResponseSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  amount: z.number().int().describe("Valor em centavos"),
  status: z.enum(Object.values(OrderStatus)),
  createdAt: z.iso.datetime(),
});

export const ordersPageResponseSchema = z.object({
  items: z.array(orderResponseSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export type CreateOrderBody = z.infer<typeof createOrderBodySchema>;
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
export type OrderParams = z.infer<typeof orderParamsSchema>;
export type CancelOrderBody = z.infer<typeof cancelOrderBodySchema>;
