import {
  orderCreatedMessageSchema,
  type OrderCreatedMessage,
} from "@microservices/contracts";
import type { Channel } from "amqplib";
import type { OrderEventsPublisher } from "../../../application/ports/order-events-publisher.ts";

type PublishChannel = Pick<Channel, "sendToQueue">;

export class RabbitMQOrderEventsPublisher implements OrderEventsPublisher {
  #channel: PublishChannel;

  constructor(channel: PublishChannel) {
    this.#channel = channel;
  }

  async publishOrderCreated(message: OrderCreatedMessage): Promise<void> {
    const data = orderCreatedMessageSchema.parse(message);

    this.#channel.sendToQueue(
      "orders-queue",
      Buffer.from(JSON.stringify({ data })),
    );
  }
}
