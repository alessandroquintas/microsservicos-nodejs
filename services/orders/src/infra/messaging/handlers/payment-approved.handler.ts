import type { ConsumeMessage } from "amqplib";
import { paymentApprovedMessageSchema } from "@microservices/contracts";
import { InvalidMessageError } from "@microservices/messaging";
import type { MarkOrderAsPaidUseCase } from "../../../application/use-cases/mark-order-as-paid.ts";
import {
  InvalidOrderStatusTransitionError,
  OrderNotFoundError,
} from "../../../domain/order/errors.ts";
import { toPermanentError } from "./permanent-errors.ts";

type MarkOrderAsPaid = Pick<MarkOrderAsPaidUseCase, "execute">;

export function createPaymentApprovedHandler(markOrderAsPaid: MarkOrderAsPaid) {
  return async function handlePaymentApproved(
    message: ConsumeMessage,
  ): Promise<void> {
    let payload: unknown;

    try {
      payload = JSON.parse(message.content.toString());
    } catch {
      throw new InvalidMessageError(
        "PaymentApproved message is not valid JSON",
      );
    }

    const result = paymentApprovedMessageSchema.safeParse(
      (payload as { data?: unknown } | null)?.data,
    );

    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");

      throw new InvalidMessageError(
        `Invalid PaymentApproved message: ${issues}`,
      );
    }

    try {
      await markOrderAsPaid.execute({ orderId: result.data.orderId });
    } catch (error) {
      throw toPermanentError(error, [
        OrderNotFoundError,
        InvalidOrderStatusTransitionError,
      ]);
    }
  };
}
