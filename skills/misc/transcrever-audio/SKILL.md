---
name: transcrever-audio
description: Transcrever áudio ou vídeo recebido ou citado, como mensagem de voz do WhatsApp (ogg/opus), mp3, m4a, wav ou mp4. Gatilhos "ouve esse áudio", "transcreve", "o que ele disse". Roda `transcrever` (Parakeet TDT v3, offline, pt-BR) e nunca improvisa outro modelo.
---

# Transcrever áudio

`transcrever` é o único caminho de transcrição, em qualquer projeto e máquina. Modelo fixo: Parakeet TDT v3 int8 (25 línguas europeias, inclui pt-BR), offline, só CPU.

```bash
transcrever audio.ogg                    # texto no stdout
transcrever audio.ogg --timestamps       # "[mm:ss] trecho"
transcrever a.ogg b.mp3 -o saida.txt     # grava em arquivo, stdout mostra só a contagem de trechos
```

- Aceita qualquer formato que o ffmpeg abre (converte para 16 kHz mono sozinho). Áudio longo é segmentado por VAD, sem limite de duração.
- Custo medido: cerca de 0,12 s por segundo de áudio, ~1,3 GB de RAM no pico, mais ~1,5 s de carga do modelo por chamada. Junte vários arquivos numa só chamada.
- Áudio de cliente pode ter dado pessoal: devolva ao usuário o conteúdo útil, sem despejar a transcrição inteira no relatório.
- Transcrição pode errar nomes próprios e números: confirme-os antes de agir sobre eles.

## Faltou `transcrever`, o venv ou o modelo

Rode o instalador desta pasta (idempotente, retoma download interrompido): `bash <pasta desta skill>/install.sh`. No Windows: `install.ps1` (precisa de Python 3.10+ e ffmpeg no PATH). Download do modelo: ~670 MB.

Com menos de ~2 GB de RAM disponível (`free -m`), a carga do modelo é morta por OOM (exit 137): espere memória liberar em vez de trocar de modelo.
