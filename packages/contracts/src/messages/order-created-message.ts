import { z } from "zod";

export const orderCreatedMessageSchema = z.object({
  orderId: z.uuid(),
  amount: z.number().int().positive(),
  customer: z.object({
    id: z.uuid(),
    name: z.string().min(1),
    email: z.email(),
  }),
});

export type OrderCreatedMessage = z.infer<typeof orderCreatedMessageSchema>;
