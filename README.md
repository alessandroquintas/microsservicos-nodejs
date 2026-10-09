# microservices-nodejs

Sistema de pedidos, faturamento e pagamentos em microsserviços orientados a eventos, escrito em Node.js e TypeScript. Três serviços independentes, cada um com o próprio banco Postgres, se coordenam por uma saga coreografada no RabbitMQ, sem chamadas HTTP entre si. O foco do projeto é a confiabilidade da troca de mensagens: outbox transacional, consumidores idempotentes, retry com DLQ e tracing distribuído.

[![CI](https://github.com/alessandroquintas/microsservicos-nodejs/actions/workflows/ci.yml/badge.svg)](https://github.com/alessandroquintas/microsservicos-nodejs/actions/workflows/ci.yml)

## Destaques técnicos

- **Arquitetura hexagonal:** domínio e casos de uso não dependem de Fastify, Drizzle nem RabbitMQ; os adapters ficam em `infra/` e são ligados só no composition root (`src/bootstrap/` + `server.ts`), o que permite testar as regras de negócio com fakes em memória.
- **Saga coreografada entre três serviços:** pedido, fatura e pagamento avançam reagindo a eventos, sem orquestrador central e sem acoplamento síncrono.
- **Outbox transacional com publisher confirms:** estado e evento são gravados na mesma transação, e um relay publica o evento e só o marca como enviado depois do confirm do RabbitMQ, então nenhum evento se perde se o broker cair.
- **Consumidores idempotentes:** a entrega é at-least-once, e cada consumidor tolera mensagens duplicadas (chaves `unique` e transições de status que não fazem nada quando o destino já foi atingido).
- **Retry com atraso e DLQ via dead-lettering:** cada fila tem uma `.retry` com TTL de 5 s e uma `.dlq`; erros temporários são retentados 3 vezes, e mensagens inválidas ou erros de negócio permanentes vão direto para a DLQ.
- **Contratos de eventos validados com Zod nas duas pontas:** produtor e consumidor importam o mesmo schema de `packages/contracts`, validado antes de gravar no outbox e ao consumir; uma mudança de formato quebra o typecheck dos dois lados.
- **Tracing distribuído com OpenTelemetry:** HTTP, Postgres e AMQP são instrumentados, e um pedido pode ser acompanhado pelos três serviços no Jaeger.
- **Infraestrutura como código e CI:** programa Pulumi para AWS ECS Fargate e GitHub Actions rodando typecheck e testes de integração contra Postgres reais.

## Arquitetura

```mermaid
flowchart LR
    client([Cliente]) -->|HTTP| kong[Kong :8000]
    kong -->|/orders, /customers| orders[orders :3333]
    kong -->|/invoices| invoices[invoices :3334]
    payments[payments :3335]
    orders --- ordersdb[(Postgres orders)]
    invoices --- invoicesdb[(Postgres invoices)]
    payments --- paymentsdb[(Postgres payments)]
    rabbit{{RabbitMQ<br/>exchange topic events}}
    orders -->|OrderCreated, OrderCanceled| rabbit
    invoices -->|InvoiceCreated| rabbit
    payments -->|PaymentApproved, PaymentFailed| rabbit
    rabbit -->|OrderCreated, OrderCanceled, PaymentApproved| invoices
    rabbit -->|InvoiceCreated| payments
    rabbit -->|PaymentApproved, PaymentFailed| orders
```

O payments não é exposto pelo Kong: ele só reage a eventos. Fluxo da saga, com o caminho aprovado e o recusado:

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
    P->>P: cobra no gateway

    alt cobrança aprovada
        P->>P: pagamento approved + PaymentApproved (outbox)
        P-)O: PaymentApproved
        O->>O: pedido paid
        P-)I: PaymentApproved
        I->>I: fatura paid
    else cobrança recusada
        P->>P: pagamento failed + PaymentFailed (outbox)
        P-)O: PaymentFailed
        O->>O: pedido canceled + OrderCanceled (outbox)
        O-)I: OrderCanceled
        I->>I: fatura canceled
    end
```

Topologia das filas, regras de retry, idempotência, rotas HTTP e deploy estão detalhados no [ARCHITECTURE.md](ARCHITECTURE.md).

## Observabilidade

Cada serviço carrega o auto-instrumentation do OpenTelemetry na primeira linha do `server.ts` e exporta os traces via OTLP para o Jaeger local, de modo que um pedido aparece como um único trace passando por orders, invoices e payments.

![Trace de um pedido no Jaeger atravessando orders, invoices e payments via RabbitMQ](docs/images/jaeger-saga.png)

## Stack

| Camada | Tecnologia |
| --- | --- |
| Runtime | Node.js 22 (`--experimental-strip-types`, sem build), TypeScript 7 |
| HTTP | Fastify 5 + `fastify-type-provider-zod` 7 |
| Validação | Zod 4 |
| Banco e ORM | PostgreSQL 16, Drizzle ORM 0.45 + drizzle-kit 0.31, `pg` 8 |
| Mensageria | RabbitMQ 3 (exchange topic), amqplib 2 |
| Gateway | Kong 3.9 (modo declarativo, sem banco) |
| Observabilidade | OpenTelemetry (`auto-instrumentations-node` 0.80, `sdk-node` 0.222), Jaeger 1.57 |
| Testes | Vitest 5 |
| Containers | Docker (`node:22-alpine`, multi-stage, usuário não-root) e Docker Compose |
| IaC | Pulumi 3 (`@pulumi/aws` 7, `@pulumi/awsx` 3) em AWS ECS Fargate |
| CI | GitHub Actions |

## Como rodar localmente

**Pré-requisitos:** Node.js 22 (≥ 22.6, por causa do `--experimental-strip-types`), npm e Docker com Docker Compose.

Os serviços rodam no host e a infraestrutura em containers. Todos os comandos partem da raiz do repositório.

```bash
# 1. Clonar e instalar as dependências
git clone https://github.com/alessandroquintas/microsservicos-nodejs.git
cd microsservicos-nodejs
npm install

# 2. Infraestrutura compartilhada: RabbitMQ, Jaeger e Kong
docker compose up -d

# 3. Um Postgres por serviço (também cria o banco *_test usado nos testes)
docker compose -f services/orders/docker-compose.yml up -d --wait     # :5482
docker compose -f services/invoices/docker-compose.yml up -d --wait   # :5483
docker compose -f services/payments/docker-compose.yml up -d --wait   # :5484

# 4. Variáveis de ambiente
cp services/orders/.env.example services/orders/.env
cp services/invoices/.env.example services/invoices/.env
cp services/payments/.env.example services/payments/.env

# 5. Migrations (o db:migrate não lê o .env, a URL vai no ambiente)
DATABASE_URL=postgresql://docker:docker@127.0.0.1:5482/orders npm run db:migrate -w @microservices/orders
DATABASE_URL=postgresql://docker:docker@127.0.0.1:5483/invoices npm run db:migrate -w @microservices/invoices
DATABASE_URL=postgresql://docker:docker@127.0.0.1:5484/payments npm run db:migrate -w @microservices/payments

# 6. Seed opcional: cria um customer padrão (idempotente)
npm run db:seed -w @microservices/orders
```

Por fim, suba os três serviços, **um terminal para cada**, nesta ordem:

```bash
npm run dev -w @microservices/invoices    # :3334
npm run dev -w @microservices/payments    # :3335
npm run dev -w @microservices/orders      # :3333
```

Cada serviço declara as próprias filas ao subir, e o RabbitMQ descarta eventos publicados antes de existir a fila. Numa instalação nova, espere os três subirem antes de criar o primeiro pedido.

Interfaces úteis: RabbitMQ Management em http://127.0.0.1:15672 (`guest`/`guest`, padrão local) e Jaeger em http://127.0.0.1:16686. A documentação das rotas (Swagger UI) fica em http://127.0.0.1:3333/docs (orders) e http://127.0.0.1:3334/docs (invoices), com o OpenAPI em `/docs/json`.

## Deploy na AWS

> **Custo:** os recursos criados (dois load balancers, cinco tasks Fargate e os IPs públicos delas) são cobrados enquanto estão no ar. O deploy é pensado para ser efêmero: suba, demonstre e rode `pulumi destroy` logo em seguida.

O programa Pulumi em [`infra/`](infra/) cria na AWS (`us-east-1`) um cluster ECS Fargate com orders, invoices, payments, RabbitMQ e Kong, constrói as imagens na sua máquina e as publica no ECR. Os bancos Postgres **não** são criados pelo Pulumi.

**Pré-requisitos:**

- conta na AWS e a [AWS CLI](https://docs.aws.amazon.com/cli/) com login configurado;
- [Pulumi CLI](https://www.pulumi.com/docs/install/) com login no Pulumi Cloud (`pulumi login`);
- Docker rodando, porque as imagens são construídas localmente durante o `pulumi up`;
- três bancos Postgres externos acessíveis pela internet, um por serviço (o projeto usa o [Neon](https://neon.tech));
- endpoint e header OTLP de um backend de traces (o projeto usa o Grafana Cloud); as duas chaves são obrigatórias na stack.

**Passo a passo** (a partir da raiz do repositório):

```bash
# 1. Autenticar na AWS e conferir a conta
aws sso login --profile <perfil>        # ou credenciais equivalentes (variáveis AWS_*)
export AWS_PROFILE=<perfil>
aws sts get-caller-identity

# 2. Dependências do Pulumi (infra/ não é workspace npm) e stack
cd infra
npm install
pulumi stack select dev

# 3. Configuração da stack (os valores com --secret ficam criptografados no Pulumi.dev.yaml)
pulumi config set aws:region us-east-1
pulumi config set --secret ordersDatabaseUrl '<postgresql://...>'
pulumi config set --secret invoicesDatabaseUrl '<postgresql://...>'
pulumi config set --secret paymentsDatabaseUrl '<postgresql://...>'
pulumi config set --secret brokerUsername '<usuário do RabbitMQ>'
pulumi config set --secret brokerPassword '<senha do RabbitMQ>'
pulumi config set otlpEndpoint '<endpoint OTLP, ex.: https://otlp-gateway-<região>.grafana.net/otlp>'
pulumi config set --secret otlpHeaders '<Authorization=Basic ...>'
pulumi config set paymentApprovalRate 0.8   # opcional, padrão 0.8
cd ..

# 4. Migrations nos bancos externos, um serviço por vez (o db:migrate não lê o .env)
DATABASE_URL='<url do banco do orders>' npm run db:migrate -w @microservices/orders
DATABASE_URL='<url do banco do invoices>' npm run db:migrate -w @microservices/invoices
DATABASE_URL='<url do banco do payments>' npm run db:migrate -w @microservices/payments

# Opcional: customer de exemplo no orders. O db:seed exige que services/orders/.env exista
# (copie do .env.example); o DATABASE_URL do ambiente tem precedência sobre o do arquivo.
DATABASE_URL='<url do banco do orders>' npm run db:seed -w @microservices/orders

# 5. Ver o que será criado, sem criar nada
cd infra
pulumi preview

# 6. Criar (build e push das imagens + recursos)
pulumi up
```

Depois do `pulumi up`, as tasks levam alguns minutos para ficar saudáveis. As URLs ficam nas saídas da stack:

```bash
pulumi stack output                    # ordersUrl, invoiceUrl, paymentsId, rabbitMQAdminUrl, kongUIUrl...
```

Todos os listeners HTTP usam o mesmo Application Load Balancer, e a porta 80 dele é o proxy do Kong. A saída `ordersUrl` (`http://<hostname do ALB>`, sem porta) serve como URL base do gateway:

```bash
KONG_URL=$(pulumi stack output ordersUrl)
curl -s -X POST "$KONG_URL/orders" \
  -H 'Content-Type: application/json' \
  -d '{"customerId":"5961a952-0d3e-465f-b635-4b93a1cefa97","amount":1050}'   # customer do db:seed
curl -s "$KONG_URL/orders?page=1&pageSize=10"
```

As demais chamadas de [Experimente a API](#experimente-a-api) funcionam trocando `http://127.0.0.1:8000` por `$KONG_URL`. Como no ambiente local, espere os três serviços subirem antes do primeiro pedido.

Para derrubar tudo (os repositórios ECR são apagados junto; os bancos externos não são afetados):

```bash
pulumi destroy
```

**Problemas comuns:**

- **Sessão SSO expirada.** O Pulumi falha com `Failed to refresh cached SSO credentials` e pode mostrar erros secundários como `grpc: the client connection is closing`, que somem quando a causa é resolvida. Refaça o `aws sso login --profile <perfil>`. No WSL, onde o navegador não abre sozinho, use `aws sso login --profile <perfil> --use-device-code`.
- **Docker parado.** O build das imagens (`app-orders-image`, `app-invoices-image`, `app-payments-image`, `app-kong-image`) falha se o Docker não estiver rodando na máquina que executa o `pulumi up`. Inicie o Docker e rode o comando de novo.

## Experimente a API

Todas as chamadas passam pelo Kong na porta 8000. `amount` é sempre em centavos.

```bash
# Criar um customer
CUSTOMER_ID=$(curl -s -X POST http://127.0.0.1:8000/customers \
  -H 'Content-Type: application/json' \
  -d '{"name":"Jane Roe","email":"jane@example.com","address":"Rua A, 1","state":"PR","zipCode":"80000-000","country":"Brazil"}' \
  | sed -E 's/.*"customerId":"([^"]+)".*/\1/')
echo "$CUSTOMER_ID"

# Criar um pedido de R$ 10,50
ORDER_ID=$(curl -s -X POST http://127.0.0.1:8000/orders \
  -H 'Content-Type: application/json' \
  -d "{\"customerId\":\"$CUSTOMER_ID\",\"amount\":1050}" \
  | sed -E 's/.*"orderId":"([^"]+)".*/\1/')
echo "$ORDER_ID"

# Consultar o pedido: pending, e em poucos segundos paid ou canceled
curl -s http://127.0.0.1:8000/orders/$ORDER_ID

# Consultar a fatura do pedido (open, paid ou canceled)
curl -s "http://127.0.0.1:8000/invoices?orderId=$ORDER_ID"

# Listar pedidos com filtros e paginação
curl -s "http://127.0.0.1:8000/orders?status=paid&page=1&pageSize=10"

# Cancelar o pedido (só pedidos pending; um pedido já pago responde 409)
curl -s -X POST http://127.0.0.1:8000/orders/$ORDER_ID/cancel \
  -H 'Content-Type: application/json' \
  -d '{"reason":"Changed my mind"}'
```

**Os dois caminhos da saga.** O payments usa um gateway falso que aprova cada cobrança com a probabilidade `PAYMENT_APPROVAL_RATE` (de 0 a 1, padrão `0.8` no `.env`). Para forçar um caminho, reinicie o payments com a variável no ambiente, que tem precedência sobre o `.env`:

```bash
PAYMENT_APPROVAL_RATE=1 npm run dev -w @microservices/payments   # tudo aprovado: pedido e fatura paid
PAYMENT_APPROVAL_RATE=0 npm run dev -w @microservices/payments   # tudo recusado: pedido e fatura canceled
```

## Testes

```bash
npm test                                  # todos os workspaces
npm test -w @microservices/orders         # um workspace
```

Os testes de `test/infra/db/` precisam do Postgres de cada serviço no ar (passo 3 acima); o `globalSetup` do Vitest aplica as migrations no banco `*_test` sozinho. Nenhum teste precisa de RabbitMQ.

| Tipo | Onde | Precisa de Postgres? |
| --- | --- | --- |
| Domínio (entidades e value objects) | `test/domain/` | Não |
| Casos de uso, com fakes in-memory | `test/application/` | Não |
| Repositórios, consultas, unit of work e outbox (Drizzle) | `test/infra/db/` | **Sim** |
| Rotas HTTP (`app.inject`) | `test/infra/http/` | Não |
| Handlers de mensagens | `test/infra/messaging/` | Não |
| Gateway de pagamento falso | `services/payments/test/infra/gateway/` | Não |
| Consumer, retry, topologia e outbox relay | `packages/messaging/test/` | Não |

Totais da última execução de `npm test`:

| Pacote | Arquivos | Testes |
| --- | ---: | ---: |
| `@microservices/orders` | 19 | 122 |
| `@microservices/invoices` | 16 | 84 |
| `@microservices/payments` | 10 | 43 |
| `@microservices/messaging` | 4 | 24 |
| **Total** | **49** | **273** |

O CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) roda `npm ci`, `npm run typecheck` e `npm test` com os três Postgres como service containers, a cada push na `main` e em todo pull request.

## Estrutura do repositório

```
.
├── .github/workflows/   # CI: typecheck e testes com Postgres
├── docker/
│   └── kong/            # imagem do API Gateway e configuração declarativa das rotas
├── docs/
│   └── images/          # imagens usadas na documentação
├── infra/               # Pulumi (AWS ECS Fargate); projeto separado, fora dos workspaces
├── packages/
│   ├── contracts/       # schemas Zod dos eventos, exchange e routing keys
│   └── messaging/       # consumer com retry/DLQ, topologia de filas e outbox relay
├── services/
│   ├── orders/          # customers e pedidos; inicia e encerra a saga
│   ├── invoices/        # faturas criadas a partir dos pedidos
│   └── payments/        # cobrança das faturas no gateway falso
├── ARCHITECTURE.md      # documentação técnica detalhada
└── docker-compose.yml   # RabbitMQ, Jaeger e Kong para desenvolvimento local
```

Cada serviço segue a mesma organização: `src/domain`, `src/application`, `src/infra`, `src/bootstrap` e `src/server.ts` (composition root), com `test/` espelhando o `src/`.

## Decisões e limitações conhecidas

A comunicação entre os serviços é só assíncrona, para que nenhum serviço fique indisponível porque outro caiu. A saga é coreografada em vez de orquestrada porque o fluxo é curto e linear. Todo evento sai pelo outbox para garantir a consistência entre o banco e o broker, o que leva a uma entrega at-least-once e, por isso, a consumidores idempotentes. Cada serviço mantém o próprio banco e o próprio modelo (inclusive o `Money`), e só os contratos das mensagens são compartilhados.

Próximos passos, a partir das [limitações conhecidas](ARCHITECTURE.md#12-limitações-conhecidas):

- **Compensação de pagamento:** um pedido cancelado antes de o payments processar a fatura ainda é cobrado, e não há estorno.
- **Concorrência entre pagamento e cancelamento:** os casos de uso não usam lock nem controle de versão, então a última escrita vence.
- **Idempotência da cobrança:** o gateway é chamado antes do commit; um gateway real precisaria de chave de idempotência.
- **Cancelamento antes da fatura:** se o `OrderCanceled` esgotar as retentativas antes de a fatura existir, ela fica `open`.
- **Eventos sem fila ligada** são descartados pelo RabbitMQ e marcados como publicados no outbox.
- **Reconexão com o RabbitMQ:** hoje o processo encerra e depende do orquestrador para voltar.
- **Logs estruturados:** o logging usa `console`, sem correlação com os traces.
- **Gateway de pagamento real** no lugar do `FakePaymentGateway`.

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE).
