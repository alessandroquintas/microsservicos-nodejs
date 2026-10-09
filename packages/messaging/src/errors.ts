// Erro permanente: o startConsumer manda a mensagem direto para a DLQ, sem
// retentativas. Use para mensagem inválida e para erros de negócio que não
// mudam com o tempo (passe o erro original em `cause`).
export class InvalidMessageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InvalidMessageError";
  }
}
