import type { ConsumeMessage } from "amqplib";
import { orderCreatedMessageSchema } from "@microservices/contracts";
import type { CreateInvoiceFromOrderUseCase } from "../../../application/use-cases/create-invoice-from-order.ts";
import { InvalidMessageError } from "../errors.ts";

type CreateInvoiceFromOrder = Pick<CreateInvoiceFromOrderUseCase, "execute">;

export function createOrderCreatedHandler(
  createInvoiceFromOrder: CreateInvoiceFromOrder,
) {
  return async function handleOrderCreated(
    message: ConsumeMessage,
  ): Promise<void> {
    let payload: unknown;

    try {
      payload = JSON.parse(message.content.toString());
    } catch {
      throw new InvalidMessageError("OrderCreated message is not valid JSON");
    }

    const result = orderCreatedMessageSchema.safeParse(
      (payload as { data?: unknown } | null)?.data,
    );

    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");

      throw new InvalidMessageError(`Invalid OrderCreated message: ${issues}`);
    }

    await createInvoiceFromOrder.execute({ orderId: result.data.orderId });
  };
}
