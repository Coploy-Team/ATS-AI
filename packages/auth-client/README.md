# @coploy/auth-client

Cliente de autenticação dos frontends da Coploy. Abstrai o provedor por trás de
uma interface só — Firebase Auth hoje, BetterAuth no selfhosted — para que a
aplicação não saiba qual dos dois está em uso.

```bash
npm install @coploy/auth-client firebase
```

```ts
import { createAuthClient } from '@coploy/auth-client'
import { firebaseProvider } from '@coploy/auth-client/firebase'

const auth = createAuthClient(firebaseProvider({ /* config do Firebase */ }))

await auth.login(email, password)
auth.isAuthenticated()
await auth.getToken()
```

O provedor entra por injeção: `@coploy/auth-client/firebase` e
`@coploy/auth-client/betterauth` são entradas separadas, e o `firebase` /
`better-auth` correspondente é `peerDependency` opcional — quem usa um não
carrega o outro no bundle.

Publicado junto do [ATS da Coploy](https://github.com/Coploy-Team/ATS-AI) porque ele
depende deste pacote. Apache-2.0.
