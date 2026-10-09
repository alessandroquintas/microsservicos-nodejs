import type { ConsumeMessage } from "amqplib";
import { paymentFailedMessageSchema } from "@microservices/contracts";
import { InvalidMessageError } from "@microservices/messaging";
import type { CancelOrderUseCase } from "../../../application/use-cases/cancel-order.ts";
import {
  InvalidOrderStatusTransitionError,
  OrderNotFoundError,
} from "../../../domain/order/errors.ts";
import { toPermanentError } from "./permanent-errors.ts";

type CancelOrder = Pick<CancelOrderUseCase, "execute">;

export function createPaymentFailedHandler(cancelOrder: CancelOrder) {
  return async function handlePaymentFailed(
    message: ConsumeMessage,
  ): Promise<void> {
    let payload: unknown;

    try {
      payload = JSON.parse(message.content.toString());
    } catch {
      throw new InvalidMessageError("PaymentFailed message is not valid JSON");
    }

    const result = paymentFailedMessageSchema.safeParse(
      (payload as { data?: unknown } | null)?.data,
    );

    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");

      throw new InvalidMessageError(`Invalid PaymentFailed message: ${issues}`);
    }

    const { orderId, reason } = result.data;

    try {
      await cancelOrder.execute({ orderId, reason });
    } catch (error) {
      throw toPermanentError(error, [
        OrderNotFoundError,
        InvalidOrderStatusTransitionError,
      ]);
    }
  };
}
