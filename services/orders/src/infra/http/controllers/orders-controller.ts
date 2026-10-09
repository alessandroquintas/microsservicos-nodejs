import { trace } from "@opentelemetry/api";
import type { CreateOrderUseCase } from "../../../application/use-cases/create-order.ts";
import type { GetOrderUseCase } from "../../../application/use-cases/get-order.ts";
import type { ListOrdersUseCase } from "../../../application/use-cases/list-orders.ts";
import type { CancelOrderUseCase } from "../../../application/use-cases/cancel-order.ts";
import { InvalidOrderStatusTransitionError } from "../../../domain/order/errors.ts";
import { HttpError } from "../common/errors/http-error.ts";
import { created, ok, type HttpResponse } from "../common/responses/http-response.ts";
import type {
  CancelOrderBody,
  CreateOrderBody,
  ListOrdersQuery,
  OrderParams,
} from "../schemas/orders-schemas.ts";

type CreateOrder = Pick<CreateOrderUseCase, "execute">;
type GetOrder = Pick<GetOrderUseCase, "execute">;
type ListOrders = Pick<ListOrdersUseCase, "execute">;
type CancelOrder = Pick<CancelOrderUseCase, "execute">;

const DEFAULT_CANCEL_REASON = "Canceled by customer";

export class OrdersController {
  #createOrder: CreateOrder;
  #getOrder: GetOrder;
  #listOrders: ListOrders;
  #cancelOrder: CancelOrder;

  constructor(
    createOrder: CreateOrder,
    getOrder: GetOrder,
    listOrders: ListOrders,
    cancelOrder: CancelOrder,
  ) {
    this.#createOrder = createOrder;
    this.#getOrder = getOrder;
    this.#listOrders = listOrders;
    this.#cancelOrder = cancelOrder;
  }

  async create(body: CreateOrderBody): Promise<HttpResponse> {
    const order = await this.#createOrder.execute({
      customerId: body.customerId,
      amountInCents: body.amount,
    });

    trace.getActiveSpan()?.setAttribute("order_id", order.id);

    return created({ orderId: order.id });
  }

  async list(query: ListOrdersQuery): Promise<HttpResponse> {
    return ok(await this.#listOrders.execute(query));
  }

  async getById(params: OrderParams): Promise<HttpResponse> {
    return ok(await this.#getOrder.execute({ orderId: params.id }));
  }

  async cancel(
    params: OrderParams,
    body: CancelOrderBody,
  ): Promise<HttpResponse> {
    const orderId = params.id;

    try {
      await this.#cancelOrder.execute({
        orderId,
        reason: body?.reason ?? DEFAULT_CANCEL_REASON,
      });
    } catch (error) {
      if (error instanceof InvalidOrderStatusTransitionError) {
        throw new HttpError(
          409,
          `Order ${orderId} cannot be canceled: only pending orders can be canceled (${error.message})`,
        );
      }
      throw error;
    }

    return ok(await this.#getOrder.execute({ orderId }));
  }
}
