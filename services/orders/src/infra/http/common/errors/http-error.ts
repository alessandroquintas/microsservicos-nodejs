// Erro com status HTTP explícito, para quando o controller precisa de uma
// resposta diferente do mapeamento padrão do error handler.
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}
