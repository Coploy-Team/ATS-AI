# Coploy ATS — distribuição open source

O ATS completo rodando na **sua** infraestrutura, com os **seus** dados: vagas,
pipeline, candidatos, portal público de vagas, time, e-mails e permissões.
Sobe com um `docker compose up`.

> Este arquivo é o README da distribuição open (ADR-007). No monorepo interno
> ele convive com o restante; no espelho público, é o README do repositório.

## O que vem — e o que é plugin

**Na caixa:** o ATS inteiro.

- Portal público de vagas com a marca da empresa (banner, logo, cor) — o
  candidato cria conta e se candidata; a candidatura cai direto no pipeline.
- Pipeline kanban com régua de etapas configurável por vaga, anti-ghosting
  (régua de resposta ao candidato), motivos tipados de reprovação.
- Filtro de candidatura (knockout) determinístico, avaliado no servidor.
- Time com papéis (RBAC), e-mails transacionais editáveis, importação por CSV,
  requisição de vaga, estrutura organizacional e campos próprios.

**Como plugin (não incluído):** o Motor Coploy — entrevista com IA (vídeo, voz
e WhatsApp), avaliação automática por competências, análise de autenticidade.
O ATS degrada com elegância sem ele: as telas de entrevista viram convite ao
plugin, nunca botão morto. Qualquer motor pode se plugar pelos contratos de
entrada e saída (OTS); o Motor Coploy é o primeiro certificado contra eles.

## Requisitos

- Docker + Docker Compose v2
- 4 GB de RAM livres para o stack completo

## Subir

```bash
cp .env.open.example .env.open   # ajuste os segredos (openssl rand -hex 32)
docker compose -f docker-compose.open.yml --env-file .env.open up -d --build
```

Pronto:

| Endereço | O que é |
|---|---|
| http://localhost:8080 | Painel do recrutador (crie sua conta em `/criar-conta`) |
| http://localhost:8081 | Portal público de vagas (o link que a vaga divulga; candidato acompanha em `/minhas-candidaturas`) |
| http://localhost:3333 | API (contrato público em `openapi.public.json`) |

Serviços de apoio no compose: Postgres (dados), MinIO (arquivos), Redis
(cache), RabbitMQ (eventos). Migrations rodam sozinhas no boot da API.

## Primeiro fluxo, em 3 minutos

1. Crie a conta da empresa em `http://localhost:8080/criar-conta`.
2. Crie uma vaga (quatro passos; publique no final).
3. Em **Configurações → Portal de vagas**, suba banner e logo (o modal de
   encaixe mostra o tamanho real), escolha a cor da marca e copie o endereço
   do portal.
4. Divulgue o link — quem se candidatar aparece na coluna **Candidatura** do
   pipeline da vaga.

## Instalar o Motor (entrevista com IA)

O plugin é um serviço licenciado à parte. Com ele no ar, aponte o compose:

```bash
# .env.open
MOTOR_ENABLED=true
MOTOR_ENGINE_URL=...
MOTOR_ORCHESTRATOR_URL=...
MOTOR_INTERVIEW_BASE_URL=...
```

As telas de entrevista, convite e análise acendem sozinhas — a capability
desce do servidor, sem rebuild do front.

## Atualizar

```bash
git pull
docker compose -f docker-compose.open.yml --env-file .env.open up -d --build
```

Migrations são aditivas e idempotentes; o banco é seu e fica no volume
`open_postgres_data`.

## Licença

- Distribuição do produto: **AGPL-3.0**
- SDK (`@coploy/sdk`) e contratos (OTS): **Apache-2.0**

O Motor Coploy é software proprietário, licenciado separadamente.
