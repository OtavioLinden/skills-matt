---
name: limpa-branchs
description: Limpa desta máquina as branches já mergeadas (locais e no GitHub), as worktrees paradas e os containers delas, depois de um OK sobre a lista.
disable-model-invocation: true
---

# Limpa branches

Faxina desta máquina. As branches do GitHub são de todos: limpar aqui limpa para todos os PCs. Worktree, app e container existem só nesta máquina; cada PC roda a sua faxina.

O critério mora no script, não no seu julgamento: um item só sai com os **três negativos** (sem PR aberta, sem worktree ou sessão viva, sem commit fora das branches base) e, se for branch, com a ponta escrita pelo usuário. Branch de colega fica. Volume do Docker nunca entra.

## 1. Plano

Na raiz do repo que o usuário quer limpar (ou com `--raiz ~/projects` para todos os repos da pasta):

```bash
node <base da skill>/limpa.mjs plano
```

Só lê. Grava o plano em `~/.limpa-branchs/plano-*.json` e imprime, por repo, o que **sai** e o que **fica** com o motivo.

Pronto quando o plano saiu sem erro. Erro de `gh` aparece como "sem checagem de PR": nada sai daquele repo até o `gh` responder (conta errada? veja `gh auth status`).

## 2. Um OK

Mostre ao usuário a lista do que sai, agrupada por repo, e os motivos do que fica. Peça um único OK com `AskUserQuestion` ("Apagar tudo listado" / "Ainda não"). Item que ele quiser segurar: rode o plano de novo depois de ele resolver, ou siga sem aplicar.

## 3. Aplicar

```bash
node <base da skill>/limpa.mjs aplicar <plano.json>
```

O script rechecha cada item antes de apagar (estado pode ter mudado desde o plano) e pula o que deixou de qualificar. Para cada worktree que sai: copia os arquivos que só existem nela (untracked e `.scratch/`) para `~/.limpa-branchs/<repo>/<worktree>-<data>/`, remove os containers montados nela e só então remove a worktree.

Hook do projeto barrando um delete (branch protegida, autoria) é a trava funcionando: reporte o item e siga.

## 4. Relatório

Para o usuário: o que saiu, o que foi pulado na rechecagem e por quê, onde ficou o arquivo das worktrees, e o que ficou de pé por ser de colega ou ter trabalho fora da base.
