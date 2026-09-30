# Contribuindo

Este repositório é o **espelho público** da distribuição open do Coploy ATS —
montado por allowlist a partir de um monorepo interno, sempre num commit
único. Issues e pull requests são bem-vindos; o que muda é como cada parte
aceita mudança.

## Por onde começar

1. **Instale e use** — o README leva do clone ao primeiro candidato no
   pipeline em minutos. Quem contribui bem é quem já esbarrou no produto.
2. **Escolha uma issue [`good first issue`](https://github.com/Coploy-Team/ATS-AI/labels/good%20first%20issue)**
   — são pequenas de propósito, com o "onde no código" e o critério de pronto
   escritos. Comente na issue antes de começar, para ninguém fazer em dobro.
3. **Dúvida não é issue** — vai nas
   [Discussions](https://github.com/Coploy-Team/ATS-AI/discussions).
   Bug, ideia e pedido de melhoria têm modelo próprio ao abrir uma issue.
4. **Abra o PR pelo modelo**: o que muda, por quê, como foi provado. Um PR
   pequeno que fecha uma issue vale mais que um grande que fecha três.

O roadmap público está no README. Antes de propor algo grande, veja se já
está lá — e se estiver, a issue é o lugar de dizer como você faria.

## O produto (`apps/core`, `web/ats`, `web/careers`, `apps/mcp-server`, `packages/*`)

PRs são revisados e aplicados **no monorepo interno** e voltam para cá na
próxima sincronização — seu commit não aparece aqui com o hash original, mas
a mudança e o crédito vêm no changelog da sincronização. `npm run lint` e
`npm test` precisam passar.

Uma regra estrutural: as superfícies SaaS (hunting, billing, admin) são
gateadas por `capabilities.features` vindas do servidor — a edição open não
as exibe. PR que remove um gate desses será recusado.

O que a revisão olha, na ordem: a mudança resolve a dor da issue; `npm run
lint` e `npm test` passam; texto novo na tela existe em `pt` e `en`; mudança
de API vem com `apps/core/openapi.public.json` regenerado (é gerado do código
e o CI compara). Nada de dado pessoal em fixture ou captura de tela.

## O que NÃO está aqui

O **Motor Coploy** (entrevista por IA: gravação, transcrição, avaliação) é
software proprietário e se pluga pela interface documentada no contrato
(`packages/ots-contract/0.1/plugin/`). Qualquer motor que fale esse contrato
funciona — a suíte `packages/ots-conformance` certifica.

## O padrão OTS

`packages/ots-contract` e `packages/ots-conformance` têm casa própria em
[Coploy-Team/ots](https://github.com/Coploy-Team/ots) — proponha mudanças de
PROTOCOLO lá (o processo de mudança está no CONTRIBUTING de lá). As cópias
daqui existem para o compose e os testes rodarem sozinhos.

## Licença

Distribuição do produto: **AGPL-3.0** ([LICENSE](LICENSE)). SDK
(`packages/sdk`) e contratos OTS: **Apache-2.0** (licença própria em cada
pacote).
