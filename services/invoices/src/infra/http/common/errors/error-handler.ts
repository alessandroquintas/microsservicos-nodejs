import type { FastifyReply, FastifyRequest } from "fastify";

type ErrorClass = new (...args: never[]) => Error;

export type ErrorStatus = readonly [ErrorClass, number];

function getStatusCode(
  error: unknown,
  errorStatuses: readonly ErrorStatus[],
): number {
  const mapped = errorStatuses.find(([ErrorClass]) => error instanceof ErrorClass);

  if (mapped) {
    return mapped[1];
  }

  // Erros do Fastify (validação, body inválido) e HttpError.
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }

  return 500;
}

// Converte os erros em resposta: 4xx devolve a mensagem do erro; o resto vira
// 500 genérico, com o detalhe só no log.
export function createErrorHandler(errorStatuses: readonly ErrorStatus[]) {
  return (error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const statusCode = getStatusCode(error, errorStatuses);

    if (statusCode < 500) {
      const message = error instanceof Error ? error.message : "Bad request";
      return reply.status(statusCode).send({ message });
    }

    console.error("Unhandled error", {
      method: request.method,
      url: request.url,
      error,
    });

    return reply.status(500).send({ message: "Internal server error" });
  };
}
