import { randomUUID } from "node:crypto";
import { InvalidOrderIdError } from "./errors.ts";

type InvoiceProps = {
  id: string;
  orderId: string;
};

export class InvoiceEntity {
  readonly id: string;
  readonly orderId: string;

  private constructor(props: InvoiceProps) {
    const { id, orderId } = props;

    this.id = id;
    this.orderId = orderId;
  }

  static create(props: { orderId: string }): InvoiceEntity {
    const { orderId } = props;

    if (!orderId?.trim()) {
      throw new InvalidOrderIdError();
    }

    return new InvoiceEntity({
      id: randomUUID(),
      orderId,
    });
  }

  static restore(props: InvoiceProps) {
    return new InvoiceEntity(props);
  }
}
