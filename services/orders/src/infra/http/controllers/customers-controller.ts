import type { CreateCustomerUseCase } from "../../../application/use-cases/create-customer.ts";
import type { GetCustomerUseCase } from "../../../application/use-cases/get-customer.ts";
import type { CustomerEntity } from "../../../domain/customer/customer-entity.ts";
import { created, ok, type HttpResponse } from "../common/responses/http-response.ts";
import type {
  CreateCustomerBody,
  CustomerParams,
} from "../schemas/customers-schemas.ts";

type CreateCustomer = Pick<CreateCustomerUseCase, "execute">;
type GetCustomer = Pick<GetCustomerUseCase, "execute">;

function toCustomerResponse(customer: CustomerEntity) {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    address: customer.address,
    state: customer.state,
    zipCode: customer.zipCode,
    country: customer.country,
    dateOfBirth: customer.dateOfBirth?.toISOString() ?? null,
  };
}

export class CustomersController {
  #createCustomer: CreateCustomer;
  #getCustomer: GetCustomer;

  constructor(createCustomer: CreateCustomer, getCustomer: GetCustomer) {
    this.#createCustomer = createCustomer;
    this.#getCustomer = getCustomer;
  }

  async create(body: CreateCustomerBody): Promise<HttpResponse> {
    const { dateOfBirth, ...data } = body;

    const customer = await this.#createCustomer.execute({
      ...data,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
    });

    return created({ customerId: customer.id });
  }

  async getById(params: CustomerParams): Promise<HttpResponse> {
    const customer = await this.#getCustomer.execute({ customerId: params.id });

    return ok(toCustomerResponse(customer));
  }
}
