import type { ConsumeMessage } from "amqplib";
import { orderCanceledMessageSchema } from "@microservices/contracts";
import { InvalidMessageError } from "@microservices/messaging";
import type { CancelInvoiceUseCase } from "../../../application/use-cases/cancel-invoice.ts";
import { InvalidInvoiceStatusTransitionError } from "../../../domain/invoice/errors.ts";
import { toPermanentError } from "./permanent-errors.ts";

type CancelInvoice = Pick<CancelInvoiceUseCase, "execute">;

export function createOrderCanceledHandler(cancelInvoice: CancelInvoice) {
  return async function handleOrderCanceled(
    message: ConsumeMessage,
  ): Promise<void> {
    let payload: unknown;

    try {
      payload = JSON.parse(message.content.toString());
    } catch {
      throw new InvalidMessageError("OrderCanceled message is not valid JSON");
    }

    const result = orderCanceledMessageSchema.safeParse(
      (payload as { data?: unknown } | null)?.data,
    );

    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");

      throw new InvalidMessageError(`Invalid OrderCanceled message: ${issues}`);
    }

    // InvoiceNotFoundError fica de fora de propósito: a fatura pode ainda não
    // ter sido criada, então a mensagem vai para o retry.
    try {
      await cancelInvoice.execute({ orderId: result.data.orderId });
    } catch (error) {
      throw toPermanentError(error, [InvalidInvoiceStatusTransitionError]);
    }
  };
}
