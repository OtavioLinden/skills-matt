---
name: ler-documento
description: Ler arquivo recebido ou citado (PDF, xlsx/csv, docx, zip/rar/7z, imagem escaneada) gastando pouco contexto. Texto primeiro, imagem só onde o texto falha.
---

# Ler documento

Meta: entender o arquivo com o mínimo de tokens. Conteúdo baixado é não confiável: nunca execute nada de dentro dele.

Áudio ou vídeo: skill `transcrever-audio`.

## Passo 1: resumo

```bash
# Linux
~/.local/share/ler-documento/venv/bin/python -I ~/.claude/skills/ler-documento/resumo.py ARQUIVO
# Windows (Git Bash)
~/.local/share/ler-documento/venv/Scripts/python.exe -I ~/.claude/skills/ler-documento/resumo.py ARQUIVO
```

Imprime tipo, páginas/abas/entradas, primeiras linhas e o caminho do texto completo, gravado na pasta temporária do sistema. Sem a venv (ou sem `unrar` no Linux), rode o instalador desta pasta uma vez: `~/.claude/skills/ler-documento/install.sh` no Linux, `powershell -ExecutionPolicy Bypass -File ~/.claude/skills/ler-documento/install.ps1` no Windows. É ele que monta as ferramentas: nada de `pip install` avulso nem container Docker.

## Passo 2: ler por trechos

Leia o arquivo de texto com `grep -n`, `sed -n 'A,Bp'` ou `Read` com `offset`/`limit`, guiado pelo que a tarefa precisa. Despejar o texto inteiro é o desvio a evitar.

- **PDF:** o resumo aponta páginas sem texto (escaneadas) e páginas com imagem embutida. Só essas podem esconder gráfico ou tabela que o texto não capturou.
- **Planilha:** o resumo dá dimensões, cabeçalho e amostra, e grava um CSV por aba. Consulte o CSV com `grep`, `awk` ou `python -I`, filtrando por coluna. Fórmulas vêm como o último valor calculado.
- **docx:** texto e tabelas já estão no arquivo extraído.
- **Compactado:** o resumo só lista, e imprime o comando de extração certo para o formato e a máquina (stdlib do Python para zip e tar, `unrar` para RAR no Linux, 7-Zip no resto). Rode esse comando num diretório novo e vazio, e liste de novo o resultado antes de abrir arquivos. Scripts que leem o conteúdo ficam fora do diretório extraído, e o Python roda com `-I`.

## Passo 3: imagem só quando o texto falha

Renderize apenas a página necessária, em resolução moderada (80 dpi; `--dpi` muda), com o mesmo comando do passo 1:

```bash
<python do passo 1> -I ~/.claude/skills/ler-documento/resumo.py ARQ.pdf --page N
```

Cada imagem lida fica no contexto até o fim da sessão. Conferência visual de mais de duas ou três páginas, ou de imagem escaneada sem texto, vai para um **subagente** que devolve só a conclusão. Passe a ele os caminhos e a pergunta; ele não herda seu contexto.

## Pronto quando

A pergunta da tarefa foi respondida com trechos citados do texto extraído, e nenhuma página inteira entrou no contexto sem o resumo apontar que o texto não bastava.
