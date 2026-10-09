import { z } from "zod";

export const paymentApprovedMessageSchema = z.object({
  paymentId: z.uuid(),
  invoiceId: z.uuid(),
  orderId: z.uuid(),
  amount: z.number().int().positive(),
});

export type PaymentApprovedMessage = z.infer<
  typeof paymentApprovedMessageSchema
>;

export const PAYMENT_APPROVED_EVENT = "PaymentApproved";

export const PAYMENT_APPROVED_ROUTING_KEY = "payment.approved";
