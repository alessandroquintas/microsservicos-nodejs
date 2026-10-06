import type { Channel, ConsumeMessage } from "amqplib";
import { orderCreatedMessageSchema } from "@microservices/contracts";
import type { CreateInvoiceFromOrderUseCase } from "../../../application/use-cases/create-invoice-from-order.ts";

type AckChannel = Pick<Channel, "ack" | "nack">;
type CreateInvoiceFromOrder = Pick<CreateInvoiceFromOrderUseCase, "execute">;

export function createOrderCreatedHandler(
  createInvoiceFromOrder: CreateInvoiceFromOrder,
) {
  return async function handleOrderCreated(
    message: ConsumeMessage,
    channel: AckChannel,
  ) {
    let orderId: string | undefined;

    try {
      const payload = JSON.parse(message.content.toString());
      const result = orderCreatedMessageSchema.safeParse(payload?.data);

      if (!result.success) {
        console.warn("Invalid OrderCreated message, discarding", {
          issues: result.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
        channel.nack(message, false, false);
        return;
      }

      orderId = result.data.orderId;

      await createInvoiceFromOrder.execute({ orderId });
      channel.ack(message);
    } catch (error) {
      console.error("Failed to process OrderCreated", { orderId, error });
      channel.nack(message, false, false);
    }
  };
}
