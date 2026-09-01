# @coploy/sdk

SDK oficial da **Coploy Public API** — 100% gerado do contrato público (`openapi.public.json`, ADR-003). Nada aqui é escrito à mão além do runtime HTTP; contribuições de código gerado não são aceitas — a mudança certa é sempre no contrato.

```bash
npm install @coploy/sdk
```

```ts
import { configureCoploySdk } from '@coploy/sdk'
import { empresa } from '@coploy/sdk/react'

configureCoploySdk({ baseUrl: 'https://api.coploy.io', getToken: () => token })

const { data } = empresa.useGetCompaniesJobs()
```

O pacote é dividido por **superfície** — `empresa`, `candidato`, `publico`,
`integracoes` — porque são públicos diferentes com autenticação diferente, e
importar a superfície certa é o que impede o cliente de chamar rota que a
sessão dele nunca vai poder chamar.

A versão do pacote acompanha a do contrato em **major.minor** (o CI recusa
divergência): `@coploy/sdk@0.40.x` fala o contrato `0.40.0`.

## Instalação

```bash
npm install @coploy/sdk
# hooks React (opcional):
npm install @tanstack/react-query
```

## Uso — cliente fetch (framework-agnostic)

```ts
import { configureCoploySdk, empresa, CoployApiError } from '@coploy/sdk'

configureCoploySdk({
  baseUrl: 'https://api.coploy.io/core',
  getToken: () => auth.currentUser?.getIdToken() ?? null, // sessão de empresa/candidato
  // ou, para a superfície integracoes:
  // apiKey: process.env.COPLOY_API_KEY,
})

const jobs = await empresa.getCompaniesJobs({ limit: 20 })
```

## Uso — hooks React (TanStack Query)

```tsx
import { empresa } from '@coploy/sdk/react'

function JobsList() {
  const { data, isLoading } = empresa.useGetCompaniesJobs({ limit: 20 })
  // query keys vêm do gerador — invalide com as keys exportadas, nunca strings manuais
}
```

## Superfícies

| Módulo | Sessão | Quem usa |
|---|---|---|
| `empresa` | membership de empresa (Bearer) | ATS v2 |
| `candidato` | sessão de candidato (Bearer) | área do candidato |
| `publico` | sem auth / token efêmero | careers, signup, HM review |
| `integracoes` | `x-api-key` de empresa | integradores externos |

## Erros

Todo status não-2xx vira `CoployApiError` com `status`, `body` e mensagem legível.

## Regenerar (monorepo)

```bash
npm run generate --workspace @coploy/sdk   # split por x-surface + orval
npm run check:generated --workspace @coploy/sdk  # o que o CI roda
```

Versão do pacote anda em lockstep `major.minor` com a versão do contrato — o split falha se divergirem.

## Licença

Apache-2.0.
