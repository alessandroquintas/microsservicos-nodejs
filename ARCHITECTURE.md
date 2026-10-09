# Arquitetura

Este documento descreve a arquitetura **atual** do repositório `microservices-nodejs`, com base no código existente. Pontos inconsistentes ou incompletos estão listados na [seção 13](#13-inconsistências-e-pontos-de-atenção).

---

## 1. Visão geral

O sistema tem três microsserviços Node.js, cada um com o próprio banco Postgres:

- **orders** (`services/orders`, :3333): cadastro e consulta de clientes (`/customers`), criação, consulta e cancelamento de pedidos (`/orders`). Publica `OrderCreated` e `OrderCanceled` pelo outbox e reage a `PaymentApproved` / `PaymentFailed`.
- **invoices** (`services/invoices`, :3334): cria a fatura a partir do `OrderCreated` (com valor, vencimento e um retrato do cliente) e publica `InvoiceCreated` pelo outbox. Marca a fatura como paga no `PaymentApproved` e a cancela no `OrderCanceled`. Expõe a consulta de faturas (`/invoices`).
- **payments** (`services/payments`, :3335): consome `InvoiceCreated`, cobra num gateway de pagamento (hoje um gateway falso) e publica `PaymentApproved` ou `PaymentFailed` pelo outbox. Só expõe `/health`.

Na frente fica um API Gateway Kong (`docker/kong`), que roteia `/orders` e `/customers` para o orders e `/invoices` para o invoices. O payments não é exposto pelo Kong. A comunicação entre os serviços é só assíncrona, pela exchange topic `events` do RabbitMQ (ver [4.2](#42-catálogo-de-eventos-e-topologia)), e todo evento sai por um outbox transacional (ver [4.4](#44-outbox)).

```mermaid
flowchart LR
    client([Cliente]) -->|HTTP| kong[Kong<br/>:8000]
    kong -->|/orders, /customers| orders[orders<br/>:3333]
    kong -->|/invoices| invoices[invoices<br/>:3334]
    orders --- ordersdb[(Postgres orders<br/>:5482)]
    invoices --- invoicesdb[(Postgres invoices<br/>:5483)]
    payments[payments<br/>:3335] --- paymentsdb[(Postgres payments<br/>:5484)]
    orders <-->|events| rabbit[[RabbitMQ<br/>exchange events]]
    invoices <-->|events| rabbit
    payments <-->|events| rabbit
```

Os três serviços exportam traces via OpenTelemetry (`@opentelemetry/auto-instrumentations-node/register`, importado na primeira linha de cada `server.ts`). No ambiente local, o destino é o Jaeger do `docker-compose.yml` da raiz. Na AWS, é o Grafana Cloud (configurado em `infra/src/services/*.ts`).

### 1.1 Saga do pedido

O fluxo de um pedido é uma saga **coreografada**: não existe orquestrador, cada serviço reage aos eventos dos outros. Cada passo grava o próprio estado e o evento seguinte na mesma transação (outbox), e cada consumidor é idempotente.

```mermaid
sequenceDiagram
    autonumber
    actor C as Cliente
    participant O as orders
    participant I as invoices
    participant P as payments

    C->>O: POST /orders { customerId, amount }
    O->>O: pedido pending + OrderCreated (outbox)
    O-->>C: 201 { orderId }
    O-)I: OrderCreated
    I->>I: fatura open + InvoiceCreated (outbox)
    I-)P: InvoiceCreated
    P->>P: gateway.charge(...)

    alt cobrança aprovada
        P->>P: pagamento approved + PaymentApproved (outbox)
        par
            P-)O: PaymentApproved
            O->>O: pedido paid
        and
            P-)I: PaymentApproved
            I->>I: fatura paid
        end
    else cobrança recusada
        P->>P: pagamento failed + PaymentFailed (outbox)
        P-)O: PaymentFailed
        O->>O: pedido canceled + OrderCanceled (outbox)
        O-)I: OrderCanceled
        I->>I: fatura canceled
    end

    opt cancelamento pela rota (pedido ainda pending)
        C->>O: POST /orders/:id/cancel { reason? }
        O->>O: pedido canceled + OrderCanceled (outbox)
        O-->>C: 200 OrderView
        O-)I: OrderCanceled
        I->>I: fatura canceled
    end
```

- Se o `OrderCanceled` chegar ao invoices antes do `OrderCreated` (fatura ainda inexistente), o invoices retenta a mensagem (erro temporário, ver [4.3](#43-validação-retry-e-dlq)).
- A saga não tem compensação de pagamento. Se o cliente cancelar pela rota enquanto o payments ainda não processou a fatura, o payments cobra mesmo assim, e o `PaymentApproved` vai para a DLQ no orders e no invoices (transição inválida). Ver [12](#12-limitações-conhecidas).

---

## 2. Estrutura do monorepo

```
microservices-nodejs/
├── .github/
│   └── workflows/          # ci.yml: typecheck + testes (Postgres de teste dos três serviços)
├── docker/
│   └── kong/               # Dockerfile, config.template.yaml, startup.sh do API Gateway
├── infra/                  # Programa Pulumi (AWS ECS Fargate), NÃO é workspace npm
├── packages/
│   ├── contracts/          # @microservices/contracts: schemas zod das mensagens e routing keys
│   └── messaging/          # @microservices/messaging: consumer, retry/DLQ, topologia, outbox relay
├── services/
│   ├── invoices/           # @microservices/invoices
│   ├── orders/             # @microservices/orders
│   └── payments/           # @microservices/payments
├── docker-compose.yml      # RabbitMQ, Jaeger e Kong para desenvolvimento local
├── package.json            # raiz: declara os workspaces e os scripts agregados
└── package-lock.json       # lockfile único dos workspaces
```

| Pasta | Papel |
| --- | --- |
| `services/` | Um diretório por microsserviço. Cada um tem `src/`, `test/`, `Dockerfile`, um `docker-compose.yml` com o próprio Postgres, `drizzle.config.ts`, `vitest.config.ts`, `.env.example` e `.env.test`. |
| `packages/` | Código compartilhado entre os serviços: `contracts` (formato das mensagens) e `messaging` (infraestrutura técnica de mensageria, sem banco). |
| `docker/` | Imagem do Kong. O `startup.sh` usa `envsubst` para gerar `/kong/config.yaml` a partir de `config.template.yaml`, substituindo `ORDERS_SERVICE_URL` e `INVOICES_SERVICE_URL`. |
| `infra/` | Infraestrutura como código (Pulumi + `@pulumi/awsx`): cluster ECS, um ALB e um NLB, repositórios ECR, build e push das imagens e os serviços Fargate de orders, invoices, payments, rabbitmq e kong. |
| `.github/` | CI no GitHub Actions (ver [8.4](#84-ci)). |

### npm workspaces

O `package.json` da raiz declara:

```json
"workspaces": ["services/*", "packages/*"],
"scripts": {
  "test": "npm run test --workspaces --if-present",
  "typecheck": "npm run typecheck --workspaces --if-present"
}
```

- Existe um único `package-lock.json`, na raiz. O `npm install` cria symlinks em `node_modules/@microservices/{orders,invoices,payments,contracts,messaging}`.
- Os serviços consomem os pacotes como dependência normal: `"@microservices/contracts": "^1.0.0"`, `"@microservices/messaging": "^1.0.0"` (instalados com `npm install @microservices/<pacote> -w <serviço>`).
- **Cada pacote declara as próprias dependências.** Não dependa do hoisting. Exemplo: o orders declara `@opentelemetry/api` porque `src/infra/http/app.ts` usa `trace`, e os outros não declaram porque não usam. Todos declaram `zod`, `amqplib`, `drizzle-orm` etc., mesmo que a versão física seja compartilhada.
- `infra/` **não** faz parte dos workspaces e tem o próprio `package-lock.json`.
- Os Dockerfiles dos serviços instalam só as dependências de produção do workspace alvo (`npm ci --omit=dev --workspace=@microservices/orders`). Para isso, copiam os `package.json` de **todos** os workspaces (os dois pacotes e os três serviços), porque o `npm ci` exige que o lockfile bata. No runner, copiam `packages/contracts`, `packages/messaging` e o próprio serviço.

---

## 3. Arquitetura dos serviços (hexagonal)

### 3.1 Camadas

Cada serviço segue a estrutura `src/{domain,application,infra}` + `src/server.ts`.

| Camada | O que pode conter | orders | invoices | payments |
| --- | --- | --- | --- | --- |
| `domain/` | Entidades, value objects, erros de domínio e as **interfaces de repositório**, com uma subpasta por agregado. Código TypeScript puro. | `order/`, `customer/`, `shared/money.ts` | `invoice/`, `shared/money.ts` | `payment/`, `shared/money.ts` |
| `application/` | Casos de uso (`use-cases/`), portas que não são de persistência (`ports/`) e portas de leitura (`queries/`). | `create-order`, `create-customer`, `get-customer`, `get-order`, `list-orders`, `mark-order-as-paid`, `cancel-order`; `ports/{order-events-publisher,unit-of-work}.ts`; `queries/orders-query.ts` | `create-invoice-from-order`, `mark-invoice-as-paid`, `cancel-invoice`, `get-invoice`, `list-invoices`; `ports/{invoice-events-publisher,unit-of-work}.ts`; `queries/invoices-query.ts` | `process-payment`; `ports/{payment-gateway,payment-events-publisher,unit-of-work}.ts` |
| `infra/` | Adapters: banco (Drizzle), HTTP (Fastify), mensageria (amqplib + `@microservices/messaging`), gateway externo. | `db/`, `http/`, `messaging/` | `db/`, `http/`, `messaging/` | `db/`, `http/`, `messaging/`, `gateway/` |
| `server.ts` | Composition root: instancia adapters e use cases e liga tudo. | `src/server.ts` | `src/server.ts` | `src/server.ts` |

Dentro de `infra/`, a organização é a mesma nos três serviços:

- `infra/db/client.ts`: instância do Drizzle (`drizzle(process.env.DATABASE_URL, { casing: "snake_case" })`). `infra/db/executor.ts`: tipo `DbExecutor` (`db` ou `tx`), aceito pelos repositórios.
- `infra/db/schema/*.ts` + `schema/index.ts`: tabelas Drizzle, agregadas no objeto `schema`. Todos têm `outbox_events`.
- `infra/db/repositories/drizzle-*-repository.ts`: implementação das portas de repositório.
- `infra/db/queries/drizzle-*-query.ts` (orders e invoices): implementação das portas de leitura (ver [3.5](#35-escrita-e-leitura-cqrs-leve)).
- `infra/db/outbox/`: `Outbox<Xxx>EventsPublisher` (grava o evento validado no outbox) e `DrizzleOutboxStore` (porta `OutboxStore` do pacote de mensageria). `infra/db/drizzle-unit-of-work.ts`: transação com repositório + publisher.
- `infra/db/migrations/`: migrations geradas pelo drizzle-kit.
- `infra/messaging/client.ts`: conexão AMQP com top-level await, via `connectWithRetry(() => amqp.connect(BROKER_URL))` do pacote. Exporta `broker` e `markBrokerShuttingDown()` (ver [3.6](#36-ciclo-de-vida-dos-serviços)).
- `infra/messaging/channels/<origem>.ts`: um channel por origem dos eventos. O channel de **publicação** é de confirm e declara a exchange (`orders.ts` no orders, `invoices.ts` no invoices, `payments.ts` no payments). Os channels de **consumo** declaram as filas do serviço com as funções de `topology.ts` (`payments.ts` no orders; `orders.ts` e `payments.ts` no invoices; `invoices.ts` no payments).
- `infra/messaging/topology.ts`: nomes das filas do serviço e chamadas a `declareConsumerQueues`.
- `infra/messaging/routing-keys.ts`: `ROUTING_KEY_BY_EVENT_TYPE`, o mapa de tipo de evento do outbox para routing key, passado ao `OutboxRelay`.
- `infra/messaging/handlers/*.handler.ts`: um handler por evento consumido, e `permanent-errors.ts` (`toPermanentError`, ver [4.3](#43-validação-retry-e-dlq)).
- `infra/http/app.ts`: `buildApp(deps)`, instância do Fastify com `fastify-type-provider-zod`.
- Só no payments: `infra/gateway/fake-payment-gateway.ts`.

### 3.2 Regra de dependência

```
infra  ──▶  application  ──▶  domain
  │              │
  └──────────────┴──▶  @microservices/contracts
  └──────────────────▶  @microservices/messaging
```

- **domain** não importa nada de `application`, de `infra` nem de bibliotecas de terceiros. A única importação externa é o built-in `node:crypto` (`randomUUID`) nas entidades.
- **application** importa só de `domain` e, para as portas de eventos, tipos de `@microservices/contracts`. Exemplo: `application/ports/order-events-publisher.ts` faz `import type { OrderCanceledMessage, OrderCreatedMessage } from "@microservices/contracts"`.
- **infra** implementa as portas e, nos adapters de entrada, depende do caso de uso só pelo formato `Pick<UseCase, "execute">` (`createOrder: Pick<CreateOrderUseCase, "execute">`, `type CancelInvoice = Pick<CancelInvoiceUseCase, "execute">`). Assim, o teste do adapter injeta `{ execute: vi.fn() }` sem montar o caso de uso real.
- `@microservices/messaging` só é importado em `infra/` e no `server.ts`.
- Os casos de uso recebem as portas pelo construtor e as guardam em campos privados `#`.
- Os bounded contexts não importam código uns dos outros: o invoices tem o próprio `Money` e guarda um retrato do cliente vindo da mensagem, sem conhecer o domínio do orders.

### 3.3 Portas e adapters

| Serviço | Porta (interface) | Adapter de produção | Fake nos testes |
| --- | --- | --- | --- |
| orders | `OrdersRepository` (`save` com upsert por id, `findById`) | `DrizzleOrdersRepository` | `InMemoryOrdersRepository` |
| orders | `CustomersRepository` (`findById`, `findByEmail`, `save`) | `DrizzleCustomersRepository` (converte o unique de email em `CustomerAlreadyExistsError`) | `InMemoryCustomersRepository` |
| orders | `OrderEventsPublisher` (`publishOrderCreated`, `publishOrderCanceled`) | `OutboxOrderEventsPublisher` | `FakeOrderEventsPublisher` |
| orders | `UnitOfWork` (`{ orders, orderEvents }` na mesma transação) | `DrizzleUnitOfWork` | `InMemoryUnitOfWork` |
| orders | `OrdersQuery` (`findById`, `list`) | `DrizzleOrdersQuery` | `FakeOrdersQuery` |
| invoices | `InvoicesRepository` (`save` com upsert por id, `findById`, `findByOrderId`) | `DrizzleInvoicesRepository` | `InMemoryInvoicesRepository` |
| invoices | `InvoiceEventsPublisher` (`publishInvoiceCreated`) | `OutboxInvoiceEventsPublisher` | `FakeInvoiceEventsPublisher` |
| invoices | `UnitOfWork` (`{ invoices, invoiceEvents }`) | `DrizzleUnitOfWork` | `InMemoryUnitOfWork` |
| invoices | `InvoicesQuery` (`findById`, `list`) | `DrizzleInvoicesQuery` | `FakeInvoicesQuery` |
| payments | `PaymentsRepository` (`save`, `findByInvoiceId`) | `DrizzlePaymentsRepository` | `InMemoryPaymentsRepository` |
| payments | `PaymentEventsPublisher` (`publishPaymentApproved`, `publishPaymentFailed`) | `OutboxPaymentEventsPublisher` | `FakePaymentEventsPublisher` |
| payments | `UnitOfWork` (`{ payments, paymentEvents }`) | `DrizzleUnitOfWork` | `InMemoryUnitOfWork` |
| payments | `PaymentGateway` (`charge({ amountInCents, customerId })`) | `FakePaymentGateway` (`infra/gateway/`, aprova conforme `PAYMENT_APPROVAL_RATE`) | o próprio `FakePaymentGateway` com `random` injetado |
| todos | `OutboxStore` (porta do `@microservices/messaging`) | `DrizzleOutboxStore` (`infra/db/outbox/`) | `FakeOutboxStore` nos testes do pacote |

Os repositórios ficam em `domain/<agregado>/`, as outras portas em `application/ports/` e as portas de leitura em `application/queries/`. Os fakes in-memory ficam em `test/fakes/` e expõem arrays públicos (`items`, `published`, `canceled`, `approved`, `failed`) para as asserções.

Adapters de **entrada** (não implementam interface, chamam o caso de uso):

| Serviço | Adapter de entrada | Use case |
| --- | --- | --- |
| orders | `buildApp(...)` (`infra/http/app.ts`): rotas da [seção 5](#5-rotas-http) | `createCustomer`, `getCustomer`, `createOrder`, `listOrders`, `getOrder`, `cancelOrder` |
| orders | `createPaymentApprovedHandler` (`orders.payment-approved`) | `MarkOrderAsPaidUseCase` |
| orders | `createPaymentFailedHandler` (`orders.payment-failed`) | `CancelOrderUseCase` (com o `reason` do pagamento) |
| invoices | `buildApp({ getInvoice, listInvoices })` | `GetInvoiceUseCase`, `ListInvoicesUseCase` |
| invoices | `createOrderCreatedHandler` (`invoices.order-created`) | `CreateInvoiceFromOrderUseCase` |
| invoices | `createPaymentApprovedHandler` (`invoices.payment-approved`) | `MarkInvoiceAsPaidUseCase` |
| invoices | `createOrderCanceledHandler` (`invoices.order-canceled`) | `CancelInvoiceUseCase` |
| payments | `buildApp()`: só `GET /health` | — |
| payments | `createInvoiceCreatedHandler` (`payments.invoice-created`) | `ProcessPaymentUseCase` |

Os handlers são registrados com `startConsumer` do pacote de mensageria, que cuida de ack, retry e DLQ.

### 3.4 `server.ts` como composition root

O `server.ts` é o único lugar que conhece as implementações concretas. A ordem é sempre: adapters de saída → use cases → adapters de entrada (HTTP e consumers) → relay do outbox → `listen` → registro do `shutdown`. Trecho de `services/invoices/src/server.ts`:

```ts
import "@opentelemetry/auto-instrumentations-node/register";

// ...imports

const invoicesRepository = new DrizzleInvoicesRepository(db);
const unitOfWork = new DrizzleUnitOfWork(db);

const createInvoiceFromOrder = new CreateInvoiceFromOrderUseCase(invoicesRepository, unitOfWork);

const orderCreatedConsumer = await startConsumer(
  ordersChannel,
  {
    queue: orderQueues.orderCreated.queue,
    deadLetterQueue: orderQueues.orderCreated.deadLetterQueue,
    maxRetries: 3,
  },
  createOrderCreatedHandler(createInvoiceFromOrder),
);

const outboxRelay = new OutboxRelay(new DrizzleOutboxStore(db), invoicesChannel, {
  exchange: EVENTS_EXCHANGE,
  routingKeys: ROUTING_KEY_BY_EVENT_TYPE,
});
outboxRelay.start();

const app = buildApp({ getInvoice, listInvoices });
app.listen({ host: "0.0.0.0", port: Number(process.env.PORT ?? 3334) });

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
```

O import do OpenTelemetry precisa ser o **primeiro**, para a auto-instrumentação conseguir aplicar patch em `http`, `fastify`, `pg` e `amqplib` antes de eles serem carregados.

### 3.5 Escrita e leitura (CQRS leve)

**Escrita.** Os use cases que mudam estado passam pelas entidades e pelos repositórios. Exemplo, `CreateOrderUseCase.execute({ customerId, amountInCents })`:

1. Busca o cliente. Se não existir, lança `CustomerNotFoundError` (a rota responde 404).
2. Cria o `OrderEntity` com `Money.fromCents(amountInCents)`. Valor zero lança `InvalidOrderAmountError`; negativo ou não inteiro, `InvalidMoneyError`.
3. Dentro de `unitOfWork.run(...)`, numa única transação: salva o pedido e grava o `OrderCreated` (`orderId`, `amount` em centavos, `customer { id, name, email }`) no outbox.

Se qualquer um dos dois falhar (por exemplo, a mensagem fora do contrato no `parse`), a transação é desfeita e nada fica gravado. A publicação no RabbitMQ acontece depois, pelo `OutboxRelay` (ver [4.4](#44-outbox)).

**Leitura.** Consultas não passam pelas entidades: não mudam estado nem aplicam regras. A aplicação define uma porta de leitura (`application/queries/orders-query.ts`, `invoices-query.ts`) que devolve DTOs já no formato da resposta (`OrderView`, `InvoiceView`, `Page<T> = { items, page, pageSize, total }`), e o Drizzle a implementa em `infra/db/queries/`. O `list` ordena por `created_at` decrescente (desempate por `id`), aplica os filtros, usa `limit`/`offset` e calcula o `total` com `count()`. Os use cases `GetOrderUseCase` / `GetInvoiceUseCase` lançam `OrderNotFoundError` / `InvoiceNotFoundError`; `ListOrdersUseCase` / `ListInvoicesUseCase` só repassam os filtros.

### 3.6 Ciclo de vida dos serviços

**Graceful shutdown.** Cada `server.ts` registra `shutdown(signal)` com `process.once("SIGTERM", ...)` (enviado pelo ECS e pelo `node --watch` ao reiniciar) e `process.once("SIGINT", ...)` (Ctrl+C). Uma segunda chamada durante o encerramento é ignorada. Um `setTimeout` de **10 s** (com `.unref()`) loga `Forced shutdown` e chama `process.exit(1)` se algum passo travar. A ordem de encerramento é a mesma nos três serviços:

| Passo | O que acontece | orders | invoices | payments |
| --- | --- | --- | --- | --- |
| 1 | log `[<Serviço>] <signal> received, shutting down` | | | |
| 2 | `consumer.stop()` de cada consumer: `channel.cancel(consumerTag)` e espera as mensagens em processamento | payment-approved, payment-failed | order-created, order-canceled, payment-approved | invoice-created |
| 3 | `app.close()`: para de aceitar HTTP e espera as requisições em andamento | ✓ | ✓ | ✓ |
| 4 | `outboxRelay.stop()`: cancela o próximo ciclo e espera o ciclo em andamento | ✓ | ✓ | ✓ |
| 5 | `markBrokerShuttingDown()`, fecha os channels e a conexão do RabbitMQ | ✓ | ✓ | ✓ |
| 6 | `db.$client.end()` e `process.exit(0)` | ✓ | ✓ | ✓ |

Recurso novo com conexão ou trabalho em andamento precisa entrar na função `shutdown`.

**Conexão com o RabbitMQ.** O `client.ts` de cada serviço conecta com `connectWithRetry` (do pacote): até 10 tentativas, com espera que dobra a cada falha (1 s, 2 s, 4 s...) limitada a 30 s, e um `console.warn` por falha. Esgotadas as tentativas, o erro é relançado no top-level await e o processo cai.

Com o serviço rodando:

- `broker.on("error")` e `channel.on("error")` só logam com `console.error`;
- `broker.on("close")`: se não foi o `shutdown` que fechou (`markBrokerShuttingDown()`), loga `RabbitMQ connection lost, exiting` e chama `process.exit(1)`. Não há reconexão dentro do processo: quem reinicia o serviço é o orquestrador (ECS ou a política de restart do container).

---

## 4. Contratos e eventos

### 4.1 `@microservices/contracts`

Fica em `packages/contracts`. Exporta, a partir de `src/index.ts`, o nome da exchange (`EVENTS_EXCHANGE = "events"`, em `src/exchanges.ts`) e, para cada mensagem, em `src/messages/<nome>-message.ts`: o schema zod, o tipo inferido, a constante do tipo do evento (gravada no outbox) e a routing key. Exemplo:

```ts
export const orderCanceledMessageSchema = z.object({
  orderId: z.uuid(),
  reason: z.string().min(1),
});

export type OrderCanceledMessage = z.infer<typeof orderCanceledMessageSchema>;

export const ORDER_CANCELED_EVENT = "OrderCanceled";

export const ORDER_CANCELED_ROUTING_KEY = "order.canceled";
```

O pacote existe para que produtor e consumidor usem **a mesma definição** da mensagem, tanto o tipo TypeScript quanto a validação em runtime. Assim, uma mudança no formato quebra o typecheck dos dois lados. Ele é distribuído como fonte TypeScript (`"exports": { ".": "./src/index.ts" }`), sem build. Não tem testes, `tsconfig.json` nem script `typecheck`: o código é verificado pelo `tsc` dos serviços que o importam.

### 4.2 Catálogo de eventos e topologia

Todos os eventos vão para a exchange `events` (topic, durable), publicados pelo `OutboxRelay` com `persistent: true` e `messageId` = id do evento no outbox. O corpo é sempre o envelope JSON `{ "data": <mensagem> }`. `amount` é sempre em centavos (inteiro > 0).

| Evento | Routing key | Formato de `data` | Produtor | Consumidores (fila) |
| --- | --- | --- | --- | --- |
| `OrderCreated` | `order.created` | `{ orderId, amount, customer: { id, name, email } }` | orders (`CreateOrderUseCase`) | invoices (`invoices.order-created`) |
| `InvoiceCreated` | `invoice.created` | `{ invoiceId, orderId, amount, customer: { id, name, email }, dueDate (ISO) }` | invoices (`CreateInvoiceFromOrderUseCase`) | payments (`payments.invoice-created`) |
| `PaymentApproved` | `payment.approved` | `{ paymentId, invoiceId, orderId, amount }` | payments (`ProcessPaymentUseCase`) | orders (`orders.payment-approved`), invoices (`invoices.payment-approved`) |
| `PaymentFailed` | `payment.failed` | `{ paymentId, invoiceId, orderId, amount, reason }` | payments (`ProcessPaymentUseCase`) | orders (`orders.payment-failed`) |
| `OrderCanceled` | `order.canceled` | `{ orderId, reason }` | orders (`CancelOrderUseCase`, pela rota ou pelo `PaymentFailed`) | invoices (`invoices.order-canceled`) |

**Filas.** Cada consumidor declara as próprias filas com `declareConsumerQueues` (ver [4.6](#46-microservicesmessaging)), sempre no mesmo formato, todas `durable`:

| Fila | Argumentos | Papel |
| --- | --- | --- |
| `<fila>` (ex.: `invoices.order-created`) | bind em `events` com a routing key. `deadLetterExchange: ""`, `deadLetterRoutingKey: <fila>.retry` | Fila principal, consumida pelo serviço. Um `nack` sem requeue manda a mensagem para a fila de retry. |
| `<fila>.retry` | `messageTtl: 5000`, `deadLetterExchange: ""`, `deadLetterRoutingKey: <fila>` | Sem consumidor. Depois de 5 s a mensagem expira e volta para a fila principal. |
| `<fila>.dlq` | — | Erros permanentes e falhas persistentes. Sem consumidor. |

São seis filas principais: `invoices.order-created`, `invoices.order-canceled`, `invoices.payment-approved`, `payments.invoice-created`, `orders.payment-approved` e `orders.payment-failed` (cada uma com `.retry` e `.dlq`).

Quem declara cada parte (`assertExchange` e `assertQueue` são idempotentes): o channel de publicação de cada serviço declara a exchange; os channels de consumo declaram a exchange, as filas e os binds daquele serviço. Nenhum produtor sabe quais filas existem.

Uma exchange topic descarta mensagens que não combinam com nenhum bind. Por isso, numa instalação nova, os três serviços precisam ter subido uma vez (criando as filas) antes do primeiro pedido (ver [9.2](#92-passo-a-passo-do-zero)).

### 4.3 Validação, retry e DLQ

**Na gravação**: cada `Outbox<Xxx>EventsPublisher` faz `<schema>.parse(message)` antes do insert no outbox. Se a mensagem violar o contrato, o `parse` lança e a transação inteira é desfeita.

**No consumo**: o handler não faz ack/nack, só lança.

- JSON inválido ou `payload.data` reprovado no `safeParse` do schema → lança `InvalidMessageError` (do pacote), com o `path` e a `message` de cada issue no texto.
- Mensagem válida → chama o use case. Os erros de negócio que não se resolvem com o tempo são convertidos em `InvalidMessageError` (com o erro original em `cause`) por `toPermanentError(error, [ErroA, ErroB])` (`infra/messaging/handlers/permanent-errors.ts`). Os demais são relançados como estão.

O `startConsumer` (`noAck: false`) decide o destino:

| Situação | Ação |
| --- | --- |
| Sucesso | `ack` |
| `InvalidMessageError` (erro permanente) | DLQ direto (sem retentativas) + `ack` |
| Outro erro (temporário), com menos de `maxRetries` (3) retentativas | `nack(message, false, false)` → fila de retry → volta em 5 s. `console.warn` com o número da tentativa. |
| Outro erro, já com 3 retentativas | DLQ + `ack` |

**Erros permanentes e temporários por consumidor:**

| Consumidor | Permanente (DLQ direto) | Temporário (retry 3× de 5 s, depois DLQ) |
| --- | --- | --- |
| todos | JSON inválido, mensagem fora do contrato | falhas de infraestrutura (banco fora etc.) |
| `invoices.order-created` | — (`InvalidInvoiceAmountError`, `InvalidMoneyError` não chegam: o contrato exige `amount` inteiro > 0) | — |
| `invoices.payment-approved` | `InvoiceNotFoundError` (a fatura sempre existe antes do `InvoiceCreated`), `InvalidInvoiceStatusTransitionError` (pagar fatura cancelada) | — |
| `invoices.order-canceled` | `InvalidInvoiceStatusTransitionError` (cancelar fatura paga) | `InvoiceNotFoundError`: o `OrderCanceled` chegou antes de o `OrderCreated` ser processado |
| `orders.payment-approved` | `OrderNotFoundError`, `InvalidOrderStatusTransitionError` (pagar pedido cancelado) | — |
| `orders.payment-failed` | `OrderNotFoundError`, `InvalidOrderStatusTransitionError` (cancelar pedido pago) | — |
| `payments.invoice-created` | — | — |

- O número de retentativas vem do header `x-death`: o `count` da entrada com `queue` igual à fila principal e `reason` igual a `"rejected"` (0 se não houver).
- O envio para a DLQ é `sendToQueue(dlq, content, { persistent: true, messageId, headers })`, com os headers originais mais `x-last-error` (a mensagem do erro), e é logado com `console.warn`.

**Reprocessar a DLQ.** Depois de corrigir a causa, mova as mensagens de `<fila>.dlq` para `<fila>` pela UI do RabbitMQ (`:15672`, aba *Queues* → a DLQ → *Move messages*, que usa o plugin shovel). Se a mensagem movida conservar o header `x-death` antigo, uma nova falha pode mandá-la direto para a DLQ, sem as 3 retentativas.

### 4.4 Outbox

Os três serviços publicam só pelo outbox, nunca direto no RabbitMQ.

- **Tabela `outbox_events`** (mesma estrutura nos três, `infra/db/schema/outbox-events.ts`): `id`, `type` (ex.: `OrderCreated`), `payload` (jsonb, a mensagem já validada), `created_at`, `published_at` (nulo enquanto pendente), `attempts` e `last_error`, com índice em `(published_at, created_at)`.
- **Unit of work**: `DrizzleUnitOfWork.run(work)` abre `db.transaction` e entrega o repositório e o publisher ligados ao `tx`. Estado e evento são gravados juntos ou nenhum dos dois.
- **Relay**: `OutboxRelay` do pacote, iniciado no `server.ts` com o `DrizzleOutboxStore` do serviço, o channel de confirm, `EVENTS_EXCHANGE` e o `ROUTING_KEY_BY_EVENT_TYPE` do serviço. Ele roda um ciclo por segundo. Cada ciclo (`publishPending`), dentro de `store.processPending(50, ...)`:
  - o store abre uma transação e seleciona até 50 eventos com `published_at` nulo, em ordem de `created_at`, com `FOR UPDATE SKIP LOCKED` (várias instâncias não publicam o mesmo evento);
  - o relay publica cada um com `channel.publish("events", routingKey, { data: payload }, { persistent: true, messageId: id })` e espera `waitForConfirms()`;
  - no confirm, `markAsPublished` grava `published_at`, incrementa `attempts` e limpa `last_error`. Na falha, `markAsFailed` incrementa `attempts`, grava `last_error` e deixa o evento pendente para o próximo ciclo.
- Um `type` sem routing key no mapa gera o erro `No routing key configured for event type "<tipo>"` e fica pendente.
- A entrega é **at-least-once**: se o processo cair entre o confirm e o commit, o evento é publicado de novo. Por isso todo consumidor é idempotente (ver 4.5).
- **Reenviar um evento**: `UPDATE outbox_events SET published_at = NULL WHERE id = '<id>';` no banco do serviço produtor. O relay o publica no próximo ciclo.

### 4.5 Idempotência dos consumidores

| Consumidor | Como é idempotente |
| --- | --- |
| invoices: `OrderCreated` | `invoices.order_id` é `unique`. O use case devolve a fatura existente sem publicar de novo (o `InvoiceCreated` foi gravado junto com ela). O `save` usa `ON CONFLICT DO NOTHING`; se uma entrega concorrente venceu, o use case relê pelo `order_id`, vê outro id e devolve a vencedora sem publicar. |
| payments: `InvoiceCreated` | `payments.invoice_id` é `unique`. Pagamento existente → não cobra nem publica de novo. Mesma verificação pós-`save` para entregas concorrentes. |
| orders: `PaymentApproved` | Pedido já `paid` → não faz nada. |
| orders: `PaymentFailed` | Pedido já `canceled` → não faz nada (o `OrderCanceled` já foi gravado no primeiro cancelamento). |
| invoices: `PaymentApproved` / `OrderCanceled` | `invoice.markAsPaid()` e `invoice.cancel()` não fazem nada se a fatura já estiver no status de destino. |

### 4.6 `@microservices/messaging`

Fica em `packages/messaging`: código técnico de mensageria, independente de banco. Tem `package.json` (`"type": "module"`, `"exports": { ".": "./src/index.ts" }`, `amqplib` em `dependencies`, scripts `test` e `typecheck`), `tsconfig.json` e testes próprios (canais e store falsos, sem RabbitMQ).

| Export | Arquivo | O que faz |
| --- | --- | --- |
| `connectWithRetry(connect, options?)` | `connect-with-retry.ts` | Retentativas com backoff exponencial (ver [3.6](#36-ciclo-de-vida-dos-serviços)). |
| `startConsumer(channel, { queue, deadLetterQueue, maxRetries }, handler)` | `consumer.ts` | Consome a fila, decide ack/retry/DLQ (ver [4.3](#43-validação-retry-e-dlq)) e devolve `{ stop() }`, que cancela o consumer e espera as mensagens em processamento. |
| `InvalidMessageError` | `errors.ts` | Erro permanente: DLQ direto. Aceita `{ cause }`. |
| `declareConsumerQueues(channel, { exchange, queue, routingKeys, retryDelayMs })` | `topology.ts` | Declara a exchange topic, a fila principal (com um bind por routing key), `<queue>.retry` com TTL e `<queue>.dlq`. Devolve `{ queue, retryQueue, deadLetterQueue }`. |
| `OutboxRelay(store, channel, { exchange, routingKeys, batchSize? })` | `outbox-relay.ts` | `publishPending()`, `start(intervalMs = 1000)` e `stop()` (espera o ciclo em andamento). |
| `OutboxStore`, `OutboxEvent`, `OutboxBatch` | `outbox-relay.ts` | Porta implementada pelo serviço: `processPending(limit, handler)` abre a transação, busca os pendentes com `FOR UPDATE SKIP LOCKED` e entrega ao handler `{ events, markAsPublished(event), markAsFailed(event, error) }`. |

**Como um serviço novo usa o pacote:**

1. `npm install @microservices/messaging -w @microservices/<serviço>` e, no Dockerfile, copiar `packages/messaging/package.json` na etapa deps e `packages/messaging` no runner.
2. `infra/messaging/client.ts`: `export const broker = await connectWithRetry(() => amqp.connect(BROKER_URL))`, com o `markBrokerShuttingDown` e o `on("close")` dos outros serviços.
3. Para **consumir**: em `topology.ts`, uma chamada a `declareConsumerQueues` por fila (nome `<serviço>.<evento>`); no channel de consumo, chame essa função; no `server.ts`, `startConsumer(channel, { queue, deadLetterQueue, maxRetries: 3 }, createXxxHandler(useCase))` e `consumer.stop()` no `shutdown`.
4. Para **publicar**: tabela `outbox_events` + migration, `DrizzleOutboxStore` (copie de um serviço existente), `Outbox<Xxx>EventsPublisher` dentro de um `DrizzleUnitOfWork`, um channel de confirm que declara a exchange, `routing-keys.ts` e `new OutboxRelay(new DrizzleOutboxStore(db), channel, { exchange: EVENTS_EXCHANGE, routingKeys })` com `start()` no boot e `stop()` no `shutdown`, antes de fechar o RabbitMQ.

---

## 5. Rotas HTTP

Erros de validação do zod respondem 400 com `{ message }`. O error handler (orders e invoices) devolve a mensagem do erro para status < 500 e `{ message: "Internal server error" }` para 500, registrando os detalhes só no `console.error`. `amount` é sempre em centavos.

**orders** (`:3333`, via Kong em `:8000`):

| Rota | Entrada | Respostas |
| --- | --- | --- |
| `GET /health` | — | 200 `Ok` |
| `POST /customers` | body `{ name, email, address, state, zipCode, country, dateOfBirth? }` (`email` com `z.email()`, `dateOfBirth` como data ISO `YYYY-MM-DD`) | 201 `{ customerId }`; 400 (validação ou dado rejeitado pelo domínio: campo vazio, email inválido, nascimento no futuro); 409 (email já cadastrado) |
| `GET /customers/:id` | — | 200 `{ id, name, email, address, state, zipCode, country, dateOfBirth }` (`dateOfBirth` ISO ou `null`); 404 |
| `POST /orders` | body `{ customerId (uuid), amount (inteiro > 0) }` | 201 `{ orderId }`; 400; 404 (customer inexistente) |
| `GET /orders` | query `page` (padrão 1, mín. 1), `pageSize` (padrão 20, máx. 100), `status` (`pending`, `paid`, `canceled`), `customerId` (uuid) | 200 `{ items: OrderView[], page, pageSize, total }`; 400 |
| `GET /orders/:id` | id uuid | 200 `OrderView` = `{ id, customerId, amount, status, createdAt }`; 400; 404 |
| `POST /orders/:id/cancel` | body opcional `{ reason }` (padrão `"Canceled by customer"`) | 200 `OrderView` atualizada (também se já estava cancelado); 400; 404; 409 (pedido pago) |

**invoices** (`:3334`, via Kong em `:8000`):

| Rota | Entrada | Respostas |
| --- | --- | --- |
| `GET /health` | — | 200 `Ok` |
| `GET /invoices` | query `page`, `pageSize` (máx. 100), `status` (`open`, `paid`, `canceled`), `orderId` (uuid) | 200 `{ items: InvoiceView[], page, pageSize, total }`; 400 |
| `GET /invoices/:id` | id uuid | 200 `InvoiceView` = `{ id, orderId, amount, status, customer: { id, name, email }, dueDate, createdAt }`; 400; 404 |

**payments** (`:3335`, sem rota no Kong): só `GET /health`.

Exemplos com HTTPie pelo Kong:

```bash
http POST :8000/customers name="Jane Roe" email=jane@example.com address="Rua A, 1" \
  state=PR zipCode=80000-000 country=Brazil dateOfBirth=1990-05-10
# 201 {"customerId":"<uuid>"}
http :8000/customers/<customerId>

http POST :8000/orders customerId=<customerId> amount:=1050
# 201 {"orderId":"<uuid>"}
http :8000/orders page==1 pageSize==10 status==pending customerId==<customerId>
http :8000/orders/<orderId>
http POST :8000/orders/<orderId>/cancel reason="Changed my mind"

http :8000/invoices orderId==<orderId>
http :8000/invoices/<invoiceId>
```

---

## 6. Status de pedido, fatura e pagamento

| Agregado | Status | Transições permitidas | Transição inválida |
| --- | --- | --- | --- |
| Pedido (`OrderEntity`) | `pending` → `paid`, `pending` → `canceled` | `pay()` e `cancel()` só a partir de `pending` | `InvalidOrderStatusTransitionError` (ex.: cancelar pedido pago, pagar pedido cancelado). Os use cases `MarkOrderAsPaid` / `CancelOrder` tratam o "já está no destino" como sucesso sem efeito; a entidade, não. |
| Fatura (`InvoiceEntity`) | `open` → `paid`, `open` → `canceled` | `markAsPaid()` e `cancel()` só a partir de `open`; no status de destino, não fazem nada (idempotentes na própria entidade) | `InvalidInvoiceStatusTransitionError` (ex.: cancelar fatura paga) |
| Pagamento (`PaymentEntity`) | `approved` ou `failed` (definitivo) | criado por `PaymentEntity.approve(...)` ou `PaymentEntity.fail(..., reason)` | — |

A fatura vence 7 dias depois da criação (`dueDate = createdAt + 7 dias`) e guarda o cliente (`id`, `name`, `email`) do momento da criação.

---

## 7. Convenções de código

Estas convenções foram extraídas do código. As exceções estão listadas na [seção 13](#13-inconsistências-e-pontos-de-atenção).

### Nomes de arquivos e classes

Arquivos em `kebab-case`. Classes em `PascalCase` com sufixo que indica o papel. No domínio, cada agregado tem uma subpasta (`domain/order/`, `domain/customer/`, `domain/invoice/`, `domain/payment/`) com o arquivo da entidade no **singular**, a interface do repositório no **plural** e um `errors.ts`. Value objects compartilhados ficam em `domain/shared/`.

| Papel | Exemplo de classe | Arquivo |
| --- | --- | --- |
| Entidade | `OrderEntity`, `CustomerEntity`, `InvoiceEntity`, `PaymentEntity` | `domain/<agregado>/<agregado>-entity.ts` |
| Value object | `Money` (um por serviço) | `domain/shared/money.ts` |
| Porta de repositório | `OrdersRepository`, `InvoicesRepository`, `PaymentsRepository` (interface, plural) | `domain/<agregado>/<plural>-repository.ts` |
| Outra porta | `OrderEventsPublisher`, `UnitOfWork`, `PaymentGateway` | `application/ports/<nome>.ts` |
| Porta de leitura | `OrdersQuery`, `InvoicesQuery` (+ `OrderView`, `InvoiceView`, `Page<T>`) | `application/queries/<plural>-query.ts` |
| Caso de uso | `CreateOrderUseCase`, `CancelInvoiceUseCase` (método único `execute(args)`) | `use-cases/create-order.ts`, `use-cases/cancel-invoice.ts` (sem o sufixo `use-case` no arquivo) |
| Repositório / consulta Drizzle | `Drizzle<Plural>Repository`, `Drizzle<Plural>Query` | `drizzle-<plural>-repository.ts`, `drizzle-<plural>-query.ts` |
| Outbox | `Outbox<Xxx>EventsPublisher`, `DrizzleOutboxStore`, `DrizzleUnitOfWork` | `infra/db/outbox/`, `infra/db/drizzle-unit-of-work.ts` |
| Handler de mensagem | `create<Evento>Handler` | `infra/messaging/handlers/<evento>.handler.ts` |
| Fake | `InMemory<Plural>Repository`, `InMemoryUnitOfWork`, `Fake<Porta>` | `test/fakes/` |
| Erro | `<Descrição>Error extends Error`, com `this.name` igual ao nome da classe | `domain/<agregado>/errors.ts` |

Os argumentos dos use cases são um objeto tipado com `type <Nome>Args = { ... }` (`CreateOrderArgs`, `CancelInvoiceArgs`).

### Entidades: construtor privado + fábricas estáticas

- `private constructor(props)`: ninguém faz `new` fora da classe.
- `static create(...)`: cria uma entidade **nova**. Valida invariantes, gera o `id` com `randomUUID()` e define valores iniciais (ex.: `status: OrderStatus.PENDING`, `createdAt: new Date()`). O `PaymentEntity` usa `approve(...)` e `fail(..., reason)` no lugar de `create`.
- `static restore(props)`: reidrata uma entidade já existente, sem validar e sem gerar id. É usado pelos repositórios e nos testes.

### Encapsulamento com `#`

- Estado mutável fica em campos privados `#` com getter público: `#status` + `get status()` em `OrderEntity` e `InvoiceEntity`, alterado só pelos métodos de transição.
- Dependências injetadas também usam `#`: `#ordersRepository`, `#db`, `#channel`.
- Dados imutáveis são `readonly` públicos (`readonly id`, `readonly amount`).

### `as const` no lugar de `enum`

```ts
export const OrderStatus = {
  PENDING: "pending",
  PAID: "paid",
  CANCELED: "canceled",
} as const;

export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
```

O mesmo padrão vale para `InvoiceStatus` e `PaymentStatus`. No banco, o equivalente é `pgEnum(...)` do Drizzle (`orders_status`, `invoice_status`, `payment_status`), que é uma função e não um `enum` TypeScript. As rotas validam o status com `z.enum(Object.values(OrderStatus))`.

### Imports

- **Extensão `.ts` obrigatória** nos imports relativos: `import { Money } from "../../domain/shared/money.ts"`. O `tsconfig.json` habilita `allowImportingTsExtensions` e `noEmit`.
- **`import type`** para tudo que é só tipo (`import type { OrdersRepository } ...`) ou `type` inline (`import { orderCreatedMessageSchema, type OrderCreatedMessage }`). O `verbatimModuleSyntax: true` no tsconfig faz o `tsc` exigir isso.

### Restrições do `--experimental-strip-types`

Os serviços rodam TypeScript direto no Node (`node --experimental-strip-types src/server.ts`), sem build. O Node só **remove** anotações de tipo, então não é possível usar sintaxe TypeScript que gera código JavaScript:

- **sem `enum`**: use objeto `as const`, como acima;
- **sem parameter properties** (`constructor(private repo: X)`): declare o campo `#repo` e atribua no corpo do construtor;
- **sem `namespace`** com código;
- imports de tipo precisam ser `import type`, senão o Node tenta importar um binding que não existe em runtime.

### Dinheiro em centavos com `Money`

- Valores monetários são inteiros em **centavos**. `Money.fromCents(cents)` lança `InvalidMoneyError` se o valor não for inteiro ou for negativo. Zero é aceito pelo `Money` e rejeitado pelas entidades (`InvalidOrderAmountError`, `InvalidInvoiceAmountError`, `InvalidPaymentAmountError`).
- A entidade guarda `Money`. Repositório e contrato usam o número (`amount: order.amount.cents`). As colunas `amount` são `integer`.
- Cada serviço tem o próprio `Money` (bounded contexts não compartilham domínio).

### Outros padrões

- Validação de entrada HTTP com zod via `fastify-type-provider-zod` (`schema: { body, querystring, params }`).
- Variáveis de ambiente obrigatórias são checadas no carregamento do módulo, com `throw new Error(...)` (`infra/db/client.ts`, `infra/messaging/client.ts`, `drizzle.config.ts`).
- Os testes usam `sut` ("system under test") para o objeto testado.

---

## 8. Testes

Vitest em todos os workspaces. Nos serviços, o `vitest.config.ts` é igual:

```ts
test: {
  globalSetup: ["./test/global-setup.ts"],
  setupFiles: ["./test/setup.ts"],
  fileParallelism: false,   // os testes de banco compartilham o mesmo DB
  silent: "passed-only",
}
```

O `packages/messaging` tem só `silent: "passed-only"` (sem banco).

### 8.1 Tipos de teste

| Tipo | Onde | Precisa de banco? |
| --- | --- | --- |
| Domínio (entidades / VOs) | `test/domain/` de cada serviço | Não |
| Caso de uso (com fakes in-memory) | `test/application/` | Não |
| Adapter de saída: Drizzle (repositórios, consultas, unit of work, outbox publisher, `DrizzleOutboxStore`) | `test/infra/db/` (consultas em `test/infra/db/queries/`) | **Sim** (Postgres de teste) |
| Adapter de entrada: rota HTTP | `test/infra/http/app.test.ts` (`buildApp` + `app.inject`, use cases `{ execute: vi.fn() }`) | Não |
| Adapter de entrada: handler | `test/infra/messaging/*.handler.test.ts` (sem canal: valida que o handler chama o use case, lança `InvalidMessageError` para mensagem inválida e erro permanente, e relança os temporários) | Não |
| Gateway falso (payments) | `test/infra/gateway/fake-payment-gateway.test.ts` (`random` injetado) | Não |
| Pacote de mensageria | `packages/messaging/test/`: `consumer`, `connect-with-retry` (sleep falso), `topology` (channel falso), `outbox-relay` (`FakeOutboxStore`) | Não |

O `drizzle-outbox-store.test.ts` de cada serviço também roda o `OutboxRelay` do pacote contra o banco real, com um canal fake `{ publish, waitForConfirms }`. Nenhum teste precisa de RabbitMQ.

A pasta `test/` espelha o `src/`: `test/domain/`, `test/application/`, `test/infra/{db,http,messaging,gateway}/`, mais `test/fakes/` para os test doubles. Os testes de banco importam o `db` real (`src/infra/db/client.ts`), limpam as tabelas no `beforeEach` e fecham a conexão no `afterAll` (`db.$client.end()`).

### 8.2 `.env.test` e `test/setup.ts`

- `test/setup.ts` tem uma linha: `process.loadEnvFile(".env.test");`. O caminho é relativo ao diretório do workspace.
- `.env.test` define só `DATABASE_URL`, apontando para o banco `*_test`: `127.0.0.1:5482/orders_test`, `127.0.0.1:5483/invoices_test` e `127.0.0.1:5484/payments_test` (usuário/senha `docker`).
- Os bancos `*_test` são criados pelos scripts `services/*/docker/create-test-database.sql`, montados em `/docker-entrypoint-initdb.d` no `docker-compose.yml` de cada serviço. O script só roda quando o volume do Postgres é criado pela primeira vez.
- `test/global-setup.ts` roda uma vez antes dos testes: carrega o `.env.test`, aplica as migrations de `src/infra/db/migrations` e fecha a conexão. Por isso, `npm test` só precisa do Postgres no ar.
- `npm run db:migrate:test -w <workspace>` continua disponível para migrar o banco de teste à mão.

### 8.3 Como rodar

```bash
# Raiz: todos os workspaces (contracts não tem script test)
npm test
npm run typecheck

# Um workspace
npm test -w @microservices/payments
npm run test:watch -w @microservices/invoices
npm test -w @microservices/messaging

# Um arquivo (de dentro do serviço)
cd services/orders && npx vitest run test/domain/money.test.ts
```

### 8.4 CI

`.github/workflows/ci.yml` roda em `push` para `main` e em todo `pull_request`, com um único job `test` (ubuntu-latest):

1. Sobe três containers `postgres:16`: `orders-db` (5482, `orders_test`), `invoices-db` (5483, `invoices_test`) e `payments-db` (5484, `payments_test`), com user/senha `docker`/`docker`. São as mesmas URLs dos `.env.test`.
2. `actions/setup-node@v4` com Node 22 e cache do npm.
3. `npm ci`, `npm run typecheck` e `npm test` (que aplica as migrations de teste pelo `globalSetup`).

O CI não sobe RabbitMQ nem Kong e não faz build de imagens Docker nem deploy.

---

## 9. Desenvolvimento local

### 9.1 Requisitos

- **Node.js 22, versão ≥ 22.6** (por causa do `--experimental-strip-types`). Os Dockerfiles usam `node:22-alpine`, o CI usa `node-version: 22` e o tsconfig estende `@tsconfig/node22`. Não há campo `engines` nem `.nvmrc`.
- **Docker + Docker Compose**, para RabbitMQ, Jaeger, Kong e um Postgres por serviço.
- **npm**, por causa dos workspaces.

### 9.2 Passo a passo do zero

Todos os comandos partem da raiz do repositório.

**1. Dependências e infra compartilhada**

```bash
npm install
docker compose up -d     # RabbitMQ, Jaeger e Kong
```

O Kong encaminha para `http://host.docker.internal:3333` (orders) e `:3334` (invoices). Por isso, os serviços rodam **no host**, e não em containers. Depois de mudar o `docker/kong/config.template.yaml`, recrie o Kong: `docker compose up -d --build --force-recreate api-gateway`.

**2. Postgres de cada serviço**

```bash
docker compose -f services/orders/docker-compose.yml up -d --wait     # :5482
docker compose -f services/invoices/docker-compose.yml up -d --wait   # :5483
docker compose -f services/payments/docker-compose.yml up -d --wait   # :5484
```

- Cada Postgres tem `healthcheck` (`pg_isready -U docker`); com `--wait`, o comando só volta quando o banco está pronto.
- Os dados ficam nos volumes nomeados `app-orders_orders_pg_data`, `app-invoices_invoices_pg_data` e `app-payments_payments_pg_data`. Eles sobrevivem a `docker compose down` e à recriação do container. **`docker compose down -v` apaga os volumes**, e com eles os dados.
- O script `create-test-database.sql` de cada serviço cria o banco `*_test` quando o volume é criado.

**3. Arquivos `.env`**

```bash
cp services/orders/.env.example services/orders/.env
cp services/invoices/.env.example services/invoices/.env
cp services/payments/.env.example services/payments/.env
```

No `.env` do payments, `PAYMENT_APPROVAL_RATE` (0 a 1, padrão 0.8) define a fração de cobranças aprovadas pelo gateway falso. Use `1` para aprovar tudo e `0` para recusar tudo. Valor fora do intervalo derruba o serviço na subida.

**4. Migrations de dev**

O `npm run db:migrate` (`drizzle-kit migrate`) **não** carrega o `.env`. Passe a URL no ambiente:

```bash
DATABASE_URL=postgresql://docker:docker@127.0.0.1:5482/orders npm run db:migrate -w @microservices/orders
DATABASE_URL=postgresql://docker:docker@127.0.0.1:5483/invoices npm run db:migrate -w @microservices/invoices
DATABASE_URL=postgresql://docker:docker@127.0.0.1:5484/payments npm run db:migrate -w @microservices/payments
```

A migration `0002` do invoices começa com `DELETE FROM "invoices";`: as faturas antigas (sem valor, status e cliente) são apagadas para as colunas `NOT NULL` novas poderem ser criadas. Os bancos de teste são migrados pelos próprios testes.

**5. Seed do orders (opcional)**

```bash
npm run db:seed -w @microservices/orders
```

Insere o cliente `DEFAULT_CUSTOMER_ID` (`5961a952-0d3e-465f-b635-4b93a1cefa97`, John Doe, `johndoe@example.com`, definido em `services/orders/src/infra/db/default-customer.ts`) com `onConflictDoNothing()`. Serve só para testes manuais: a rota recebe o `customerId` no body, e você também pode criar clientes com `POST /customers`.

**6. Serviços** (um terminal para cada)

```bash
npm run dev -w @microservices/invoices    # :3334
npm run dev -w @microservices/payments    # :3335
npm run dev -w @microservices/orders      # :3333
```

Cada serviço declara as próprias filas ao subir, e eventos publicados antes de existir a fila são descartados (ver [4.2](#42-catálogo-de-eventos-e-topologia)). Numa instalação nova, suba os três antes de criar o primeiro pedido. Como as filas são duráveis, depois disso a ordem de subida não importa: as mensagens esperam na fila do serviço parado.

**7. Testar a saga pelo Kong**

```bash
http POST :8000/customers name="Jane Roe" email=jane@example.com address="Rua A, 1" \
  state=PR zipCode=80000-000 country=Brazil
http POST :8000/orders customerId=<customerId> amount:=1050
http :8000/orders/<orderId>          # pending → paid (aprovado) ou canceled (recusado) em poucos segundos
http :8000/invoices orderId==<orderId>
```

Para conferir:

- Na UI do RabbitMQ (`:15672`), as filas da [4.2](#42-catálogo-de-eventos-e-topologia) e as DLQs.
- Nas tabelas `outbox_events` dos três bancos, o `published_at` preenchido.
- No Jaeger (`:16686`), os traces dos três serviços.

### 9.3 Portas

| Porta (host) | Componente |
| --- | --- |
| 3333 / 3334 / 3335 | orders / invoices / payments (HTTP, Fastify) |
| 5482 / 5483 / 5484 | Postgres de orders / invoices / payments (banco principal e `*_test`) |
| 5672 | RabbitMQ (AMQP) |
| 15672 | RabbitMQ Management UI |
| 8000 | Kong proxy (entrada da API) |
| 8001 / 8002 | Kong Admin API / Admin GUI |
| 8443 / 8444 | Kong proxy HTTPS / Admin API HTTPS |
| 8100 | Kong Status API (`/status/ready`) |
| 16686 | Jaeger UI |
| 4317 / 4318 | Jaeger OTLP gRPC / HTTP (os serviços usam 4318) |
| 6831/udp, 14268 | Jaeger, coletores legados |

### 9.4 `127.0.0.1` em vez de `localhost`

Use `127.0.0.1` nas URLs locais (`DATABASE_URL`, `BROKER_URL`, `OTEL_EXPORTER_OTLP_ENDPOINT`, curl). Os `.env.example` e `.env.test` já fazem isso. No Node 17+, `localhost` pode resolver primeiro para o endereço IPv6 `::1`. Dependendo do ambiente (por exemplo, WSL2 com Docker), a porta publicada pelo container não responde em IPv6, e a conexão falha com `ECONNREFUSED ::1:<porta>`.

### 9.5 Variáveis de ambiente (`.env.example`)

| Variável | orders | invoices | payments |
| --- | --- | --- | --- |
| `DATABASE_URL` | `...@127.0.0.1:5482/orders` | `...@127.0.0.1:5483/invoices` | `...@127.0.0.1:5484/payments` |
| `BROKER_URL` | `amqp://127.0.0.1:5672` | idem | idem |
| `PAYMENT_APPROVAL_RATE` | — | — | `0.8` (0 a 1) |
| `OTEL_TRACES_EXPORTER` | `otlp` | `otlp` | `otlp` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://127.0.0.1:4318` | idem | idem |
| `OTEL_SERVICE_NAME` | `app-orders` | `app-invoices` | `app-payments` |
| `OTEL_NODE_RESOURCE_DETECTORS` | `env,host,os` | idem | idem |
| `OTEL_NODE_ENABLED_INSTRUMENTATIONS` | `http,fastify,pg,amqplib` | idem | idem |
| `PORT` (opcional) | padrão `3333` | padrão `3334` | padrão `3335` |

O `BROKER_URL` local não tem credenciais, então o amqplib usa o usuário padrão do RabbitMQ (`guest`/`guest`). As mesmas credenciais servem para a UI em `:15672`.

### 9.6 Migrations

- Os schemas ficam em `src/infra/db/schema/*` e as migrations em `src/infra/db/migrations/` (`drizzle.config.ts`). O `casing: "snake_case"` converte os nomes (`customerId` vira `customer_id`).
- Para gerar uma migration nova, de dentro do serviço: `node --env-file=.env ../../node_modules/.bin/drizzle-kit generate` (o `generate` só lê o schema, mas o `drizzle.config.ts` exige `DATABASE_URL`).

---

## 10. Infra e deploy

O deploy fica em `infra/`, um projeto **Pulumi** em TypeScript (`@pulumi/awsx` classic + `@pulumi/docker-build`) para a AWS. O projeto se chama `microsservico-node-infra` e usa a stack `dev` (`Pulumi.dev.yaml`, `aws:region: us-east-1`). Ele não é workspace npm: tem `package.json` e `package-lock.json` próprios, então rode `npm install` dentro de `infra/`.

### 10.1 O que o Pulumi cria

| Recurso | Arquivo | Detalhes |
| --- | --- | --- |
| Cluster ECS | `src/cluster.ts` | `awsx.classic.ecs.Cluster("app-cluster")` |
| Application Load Balancer | `src/load-balancer.ts` | `app-lb`, com os security groups do cluster |
| Network Load Balancer | `src/load-balancer.ts` | `net-lb`, nas subnets públicas da VPC do cluster |
| Repositórios ECR + imagens | `src/images/{orders,invoices,payments,kong}.ts` | `app-orders-ecr`, `app-invoices-ecr`, `app-payments-ecr`, `app-kong-ecr` (`forceDelete: true`) |
| Fargate `fargate-orders` | `src/services/orders.ts` | 256 CPU / 512 MB. ALB listener e target group na porta 3333, health check `GET /health` |
| Fargate `fargate-invoices` | `src/services/invoices.ts` | 256 CPU / 512 MB. ALB na porta 3334, health check `GET /health` |
| Fargate `fargate-payments` | `src/services/payments.ts` | 256 CPU / 512 MB. **Sem load balancer**: só `containerPort: 3335`, sem target group nem listener, porque o payments não recebe tráfego HTTP externo (só consome e publica eventos) |
| Fargate `fargate-rabbitmq` | `src/services/rabbitmq.ts` | imagem pública `rabbitmq:3-management`, 512 CPU / 1024 MB. AMQP 5672 pelo **NLB** (TCP). Management UI 15672 pelo ALB |
| Fargate `fargate-kong` | `src/services/kong.ts` | 256 CPU / 512 MB. ALB porta **80 → 8000** (proxy), 8002 (Admin GUI), 8001 (Admin API). Container expõe também 8100 (Status API) |

Todos os serviços usam `desiredCount: 1` e `waitForSteadyState: false`.

O Kong recebe `ORDERS_SERVICE_URL` / `INVOICES_SERVICE_URL` apontando para o hostname e a porta dos listeners do ALB dos serviços. O `startup.sh` substitui esses valores no `config.template.yaml`, como no ambiente local.

O orders, o invoices e o payments recebem:

- `BROKER_URL`, montado com usuário, senha e o endpoint do NLB;
- `DATABASE_URL` (um banco por serviço);
- as variáveis `OTEL_*`, com `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`, apontando para o Grafana Cloud.

O payments recebe também `PORT=3335` e `PAYMENT_APPROVAL_RATE` (config `paymentApprovalRate`). O orders e o invoices não recebem `PORT`: usam o padrão do código e do Dockerfile (3333 e 3334). Sem rota no Kong nem listener no ALB, o payments só é observável pelos traces, pelos logs da task e pelo efeito nos pedidos e nas faturas.

**O Pulumi não cria bancos Postgres.** As URLs dos bancos são recebidas por config e apontam para uma instância externa, que precisa ser acessível a partir do Fargate.

Saídas exportadas em `infra/index.ts`: `ordersId`, `ordersUrl`, `invoiceId`, `invoiceUrl`, `paymentsId`, `rabbitMQId`, `rabbitMQAdminUrl`, `kongId`, `kongUIUrl`. Como todos os listeners HTTP estão no mesmo ALB e a porta 80 é o proxy do Kong, `ordersUrl` (`http://<hostname do ALB>`, sem porta) é na prática a URL base do gateway.

### 10.2 Build das imagens

O build é feito pelo próprio `pulumi up` (`docker.Image` do `@pulumi/docker-build`, `platforms: ["linux/amd64"]`, `push: true`, tag `:latest` no ECR). Por isso, a máquina que roda o deploy precisa do Docker.

- **orders / invoices / payments**: `context.location: ".."` (a **raiz do repositório**) e `dockerfile.location: "../services/<serviço>/Dockerfile"`. O contexto precisa ser a raiz porque o Dockerfile copia o `package-lock.json` da raiz, os `package.json` de todos os workspaces, `packages/contracts` e `packages/messaging`. Em seguida, roda `npm ci --omit=dev --workspace=@microservices/<serviço>`. O `.dockerignore` da raiz exclui `node_modules`, `.env*`, `test`, `infra`, `docker` etc.
- **kong**: `context.location: "../docker/kong"`, usando o `Dockerfile` dessa pasta.
- As imagens dos serviços rodam `node --experimental-strip-types --no-warnings src/server.ts`, sem etapa de build TypeScript, como usuário não-root `api`.

### 10.3 Secrets e configuração

`infra/src/config.ts` lê a configuração da stack com `pulumi.Config`:

| Chave | Leitura | Uso |
| --- | --- | --- |
| `ordersDatabaseUrl` | `config.requireSecret` | `DATABASE_URL` do orders |
| `invoicesDatabaseUrl` | `config.requireSecret` | `DATABASE_URL` do invoices |
| `paymentsDatabaseUrl` | `config.requireSecret` | `DATABASE_URL` do payments |
| `otlpHeaders` | `config.requireSecret` | `OTEL_EXPORTER_OTLP_HEADERS` (autenticação no Grafana Cloud) |
| `brokerUsername` | `config.requireSecret` | `RABBITMQ_DEFAULT_USER` e `BROKER_URL` |
| `brokerPassword` | `config.requireSecret` | `RABBITMQ_DEFAULT_PASS` e `BROKER_URL` |
| `otlpEndpoint` | `config.require` (não secreto) | `OTEL_EXPORTER_OTLP_ENDPOINT` |
| `paymentApprovalRate` | `config.get` (não secreto, opcional, padrão `"0.8"`) | `PAYMENT_APPROVAL_RATE` do payments |

- Os secrets ficam criptografados em `Pulumi.dev.yaml` (`secure: ...`) e são definidos com `pulumi config set --secret <chave> <valor>`. As chaves não secretas usam `pulumi config set <chave> <valor>`. A região vem de `aws:region` (`us-east-1`).
- Nenhum valor deve ir para o código nem para a documentação.
- No ECS, os valores são passados no `environment` da task definition.

### 10.4 Health check do Kong

O target group do proxy (`proxy-target`, porta 8000) **não** verifica a porta do proxy. Ele usa a Status API do Kong:

```ts
healthCheck: {
  path: "/status/ready",
  port: "8100", // health check: Status API do Kong
  protocol: "HTTP",
},
```

A porta 8100 é habilitada por `KONG_STATUS_LISTEN=0.0.0.0:8100` (tanto no `docker-compose.yml` quanto em `src/services/kong.ts`). Na porta 8000, o proxy só responde às rotas `/orders` e `/invoices` e devolve 404 para `/`. Já o `/status/ready` responde 200 quando o Kong carregou a configuração declarativa e está pronto para receber tráfego.

### 10.5 Deploy manual e efêmero

A stack sobe recursos cobrados por hora: dois load balancers (ALB e NLB) e cinco tasks Fargate (orders, invoices, payments, rabbitmq e kong), cada uma com IP público. Não há pipeline de deploy: o fluxo é manual e **efêmero**, subir para demonstrar ou validar e destruir logo depois. O passo a passo com todos os comandos está na seção "Deploy na AWS" do [README](README.md#deploy-na-aws).

Pré-requisitos: AWS CLI com login (`aws sso login` ou credenciais equivalentes), Pulumi CLI com login no Pulumi Cloud, Docker rodando (para o build) e três bancos Postgres externos (o projeto usa o Neon).

1. Autenticar na AWS e conferir com `aws sts get-caller-identity`.
2. `cd infra && npm install && pulumi stack select dev`.
3. Definir as chaves da [10.3](#103-secrets-e-configuração) com `pulumi config set` (as secretas com `--secret`).
4. Aplicar as migrations em cada banco externo com `DATABASE_URL=<url> npm run db:migrate -w @microservices/<serviço>` (na raiz) e, se quiser o customer de exemplo, `npm run db:seed -w @microservices/orders`. O Pulumi não roda migrations.
5. `pulumi preview` para conferir o plano e `pulumi up` para criar (build e push das imagens + recursos).
6. `pulumi stack output` para obter as URLs. As chamadas à API vão para `ordersUrl`, a porta 80 do ALB (proxy do Kong).
7. `pulumi destroy` para remover tudo. Os repositórios ECR têm `forceDelete: true`; os bancos externos não são afetados.

Se o Pulumi falhar com `Failed to refresh cached SSO credentials` (às vezes acompanhado de erros secundários como `grpc: the client connection is closing`), a sessão SSO expirou: refaça o `aws sso login` (com `--use-device-code` no WSL).

---

## 11. Como adicionar uma feature

Checklist na ordem em que o trabalho deve ser feito. Pule os passos que a feature não exige.

1. **Contrato**: se a feature publica ou consome uma mensagem, crie o schema zod, o tipo, a constante do tipo do evento e a routing key em `packages/contracts/src/messages/<nome>-message.ts` e exporte em `packages/contracts/src/index.ts`. A exchange continua sendo `events` e o envelope, `{ data }`.
2. **Entidade / value object**: em `src/domain/<agregado>/<agregado>-entity.ts`, com `private constructor`, fábricas estáticas que validam e geram o id, e `static restore`. Erros em `domain/<agregado>/errors.ts`. Teste em `test/domain/`, sem banco.
3. **Porta**: repositório em `src/domain/<agregado>/<plural>-repository.ts`; outras portas em `src/application/ports/`; leitura em `src/application/queries/`.
4. **Use case + teste com fakes**: classe `XxxUseCase` em `src/application/use-cases/`, com as portas injetadas no construtor em campos `#` e o método `execute(args)`. Teste em `test/application/` com os fakes de `test/fakes/`.
5. **Adapter de saída + teste de integração**:
   - Repositório ou consulta Drizzle em `src/infra/db/`, com schema registrado em `schema/index.ts`. Teste em `test/infra/db/` contra o banco `*_test`.
   - Evento publicado: grave no outbox dentro do unit of work (validando com o schema do contrato) e adicione o tipo em `infra/messaging/routing-keys.ts`.
6. **Adapter de entrada + teste**:
   - Rota em `src/infra/http/app.ts`, recebendo o use case como `Pick<XxxUseCase, "execute">`. Teste em `test/infra/http/` com `app.inject`.
   - Ou handler em `src/infra/messaging/handlers/<evento>.handler.ts`, validando `payload.data` com `safeParse` e lançando `InvalidMessageError` se falhar. Decida quais erros do use case são permanentes e converta-os com `toPermanentError`. Declare as filas com `declareConsumerQueues` em `topology.ts` e registre o handler com `startConsumer` no `server.ts`, com `stop()` no `shutdown`. O consumidor precisa ser idempotente.
7. **Ligar no `server.ts`**: instancie o adapter concreto, depois o use case, e passe o use case para o adapter de entrada. O import do OpenTelemetry continua na primeira linha.
8. **Migration**: gere com `drizzle-kit generate` (ver [9.6](#96-migrations)) e aplique no banco de dev (ver [9.2](#92-passo-a-passo-do-zero)). No banco de teste, o `globalSetup` do Vitest aplica a migration sozinho.

No fim, rode `npm run typecheck` e `npm test` na raiz.

---

## 12. Limitações conhecidas

Esta seção só descreve o comportamento atual. Não há propostas de solução aqui.

- **Sem compensação de pagamento.** Se o pedido for cancelado pela rota depois do `InvoiceCreated` e antes de o payments processar a fatura, o payments cobra mesmo assim. O `PaymentApproved` resultante vai para a DLQ no orders (`InvalidOrderStatusTransitionError`) e no invoices (`InvalidInvoiceStatusTransitionError`), e não há estorno.
- **Corrida entre pagamento e cancelamento.** `MarkOrderAsPaidUseCase` e `CancelOrderUseCase` leem o pedido, mudam o status em memória e fazem upsert, sem lock nem verificação de versão. Se o `PaymentApproved` e o `POST /orders/:id/cancel` chegarem ao mesmo tempo, a última escrita vence.
- **Cobrança antes do commit.** O `ProcessPaymentUseCase` chama o gateway antes da transação que grava o pagamento. Se o processo cair entre os dois, a mensagem é reentregue e a cobrança acontece de novo. Com o gateway falso isso não tem efeito, mas um gateway real precisaria de chave de idempotência.
- **Cancelamento antes da fatura.** Se o `OrderCanceled` chegar ao invoices antes do `OrderCreated` e a fatura não aparecer em 3 retentativas (cerca de 15 s), a mensagem vai para a DLQ e a fatura, quando criada, fica `open`.
- **Eventos sem bind são descartados.** Um evento publicado antes de existir uma fila ligada à routing key dele é descartado pelo RabbitMQ, mesmo com o confirm do publisher, e o outbox o marca como publicado.
- **Sem reconexão dentro do processo.** Se a conexão com o RabbitMQ cair, o serviço sai com código 1 e depende do orquestrador para voltar. No `npm run dev` local, o processo fica parado até ser reiniciado.
- **Logs com `console`.** O logging é feito com `console.log`, `console.warn` e `console.error` (servidor no ar, erros 500, retentativas, DLQ, falhas de conexão, relay e shutdown). O logger do Fastify não está habilitado, e não há log estruturado nem correlação dos logs com os traces.
- **Gateway de pagamento falso.** O `FakePaymentGateway` decide pela `PAYMENT_APPROVAL_RATE` e um número aleatório; não há integração com um gateway real.

---

## 13. Inconsistências e pontos de atenção

Itens encontrados durante a leitura do código e ainda não resolvidos. Já foram resolvidos e removidos da lista: cliente fixo na rota de pedidos, invoice guardando só `orderId`, Kong roteando `/invoices` sem rota no serviço, invoices sem error handler e sem testes de HTTP, e cópias de `connectWithRetry` / `consumer` / `OutboxRelay` em cada serviço.

### Configuração / repositório

1. **`infra/README.md` é o README do template do Pulumi.** Ele diz que o programa "creates an S3 bucket" e cita Node >= 14. O `Pulumi.yaml` também mantém `description: A minimal AWS TypeScript Pulumi program`.
2. **`infra/` usa outro padrão de módulos.** `infra/tsconfig.json` usa `module: nodenext`, imports sem extensão e `@types/node ^18`, diferente dos serviços. O nome do pacote (`microsservico-node-infra`) também não segue o escopo `@microservices/`.
3. **Sem `engines` / `.nvmrc`.** A exigência de Node 22 está só implícita (CI, Dockerfile, tsconfig).

### Arquitetura / código

4. **Error handler só no orders e no invoices.** O `buildApp()` do payments não configura `setErrorHandler`, porque só expõe `/health`.
5. **`/health` não é exposto pelo Kong**, e o payments não tem rota no Kong.
6. **CORS configurado duas vezes**: no plugin `cors` do Kong e no `@fastify/cors` (`origin: "*"`) de cada serviço.
7. **O domínio importa `node:crypto`.** A regra "domain não importa nada de fora" vale para pacotes de terceiros e outras camadas. Os módulos built-in do Node são usados (`randomUUID`).
8. **Validação de ids diferente entre entidades.** `InvoiceEntity.create` e `PaymentEntity` usam `xxxId?.trim()` (optional chaining) e `OrderEntity.create` usa `customerId.trim()`.
9. **Código repetido entre serviços.** `Money`, `DrizzleOutboxStore`, a tabela `outbox_events`, `permanent-errors.ts` e o trecho de parse + `safeParse` dos handlers existem em cada serviço. O `Money` é intencional (bounded contexts); o resto depende de Drizzle ou do schema de cada serviço e por isso ficou fora do pacote de mensageria.
10. **`GET /customers/:id` aceita qualquer string**, enquanto `GET /orders/:id` e `GET /invoices/:id` exigem UUID (400). Os ids de customers são `text`.

### Convenções de nomes

11. **`InvalidMoneyError` fora de um `errors.ts`.** Os erros dos agregados ficam em `domain/<agregado>/errors.ts`, mas o `InvalidMoneyError` está dentro de `domain/shared/money.ts` (nos três serviços).
12. **Sufixo `.handler.ts`.** Os handlers usam sufixo com ponto (`order-created.handler.ts`). Os outros arquivos usam só kebab-case.
13. **Nome do tipo de argumentos dos use cases.** O invoices usa `CreateInvoiceFromOrderUseCaseArgs`; os demais usam `<Nome>Args` (`CreateOrderArgs`, `CancelInvoiceArgs`).
14. **Comentários de seção no `server.ts`.** O orders tem "Adapters de sáida" (com erro de acentuação); invoices e payments têm "Adapters de saída", "UseCases" e "Adapters de entrada".
15. **`FakePaymentGateway` é um adapter de produção** com o prefixo `Fake`, que nos outros lugares indica test double em `test/fakes/`.

### Testes

16. **Sem testes para:** as funções de `topology.ts` dos serviços (o `declareConsumerQueues` do pacote é testado), o `shutdown` dos `server.ts`, o `GET /health` do orders e o pacote `@microservices/contracts`.
