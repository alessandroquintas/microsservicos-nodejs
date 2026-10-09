import { InvalidMessageError } from "@microservices/messaging";

type ErrorClass = new (...args: never[]) => Error;

// Erros de negócio que não se resolvem com retentativas viram
// InvalidMessageError, que o startConsumer manda direto para a DLQ. Os demais
// (banco fora, por exemplo) são devolvidos como estão e seguem para o retry.
export function toPermanentError(
  error: unknown,
  permanent: ErrorClass[],
): unknown {
  if (permanent.some((errorClass) => error instanceof errorClass)) {
    return new InvalidMessageError((error as Error).message, { cause: error });
  }

  return error;
}
