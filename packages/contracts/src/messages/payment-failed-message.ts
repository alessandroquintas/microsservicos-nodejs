import { z } from "zod";

export const paymentFailedMessageSchema = z.object({
  paymentId: z.uuid(),
  invoiceId: z.uuid(),
  orderId: z.uuid(),
  amount: z.number().int().positive(),
  reason: z.string().min(1),
});

export type PaymentFailedMessage = z.infer<typeof paymentFailedMessageSchema>;

export const PAYMENT_FAILED_EVENT = "PaymentFailed";

export const PAYMENT_FAILED_ROUTING_KEY = "payment.failed";
