import type { FastifyReply } from "fastify";

// Resposta devolvida pelos controllers, sem depender do Fastify.
export type HttpResponse = {
  statusCode: number;
  body: unknown;
};

export function ok(body: unknown): HttpResponse {
  return { statusCode: 200, body };
}

export function created(body: unknown): HttpResponse {
  return { statusCode: 201, body };
}

export function sendResponse(reply: FastifyReply, response: HttpResponse) {
  return reply.status(response.statusCode).send(response.body);
}
