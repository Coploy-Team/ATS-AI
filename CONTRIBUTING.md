# Contribuindo

Este repositório é o **espelho público** da distribuição open do Coploy ATS —
montado por allowlist a partir de um monorepo interno, sempre num commit
único. Issues e pull requests são bem-vindos; o que muda é como cada parte
aceita mudança.

## O produto (`apps/core`, `web/ats`, `web/careers`, `packages/*`)

PRs são revisados e aplicados **no monorepo interno** e voltam para cá na
próxima sincronização — seu commit não aparece aqui com o hash original, mas
a mudança e o crédito vêm no changelog da sincronização. `npm run lint` e
`npm test` precisam passar.

Uma regra estrutural: as superfícies SaaS (hunting, billing, admin) são
gateadas por `capabilities.features` vindas do servidor — a edição open não
as exibe. PR que remove um gate desses será recusado.

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
