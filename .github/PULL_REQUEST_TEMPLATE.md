## O que muda

<!-- Uma frase para quem usa, não para quem lê o diff. Qual issue fecha? -->

## Por quê

<!-- A dor que motivou. Se veio de uma issue, o link basta. -->

## Como foi provado

- [ ] `npm run lint` e `npm test` passam
- [ ] Subi com `docker compose -f docker-compose.open.yml up -d --build` e percorri o fluxo afetado
- [ ] Mudança de API: `apps/core/openapi.public.json` regenerado (`npm run generate:openapi:public --workspace=core`)
- [ ] Texto novo na tela existe em `pt` e `en`

## O que fica de fora

<!-- O que você viu e deixou de propósito para outra vez. -->

---

Este repositório é um espelho: o PR é revisado aqui e integrado na fonte, e volta na próxima sincronização com o seu crédito no changelog.
