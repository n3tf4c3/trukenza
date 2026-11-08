# Trukenza em Docker

Mesmo modelo do Riscote: servidor e cliente em containers, no Docker Desktop deste PC e depois no Orange Pi 5, publicados pelo túnel da Cloudflare. Imagens para `linux/amd64` e `linux/arm64`.

| Serviço | Imagem | Porta no computador |
| --- | --- | --- |
| `server`: mesas (Node rodando o TypeScript direto) | `trukenza-server` | 2580 |
| `client`: página compilada servida pelo nginx | `trukenza-client` | 4180 (`TRUKENZA_CLIENT_PORT` muda) |
| `tunel-servidor`, `tunel-cliente`: túneis rápidos (endereços temporários) | `cloudflare/cloudflared` | só com `--profile tunel` |
| `tunel-dominio`: túnel nomeado em trukenza.win | `cloudflare/cloudflared` | só com `--profile dominio` |

As portas foram escolhidas para não bater com as do Riscote (2567 e 4173) na mesma máquina.

## Subir e parar (raiz do projeto)

```powershell
docker compose up -d --build
docker compose logs -f server
docker compose down
```

Abra http://localhost:4180. O cliente procura o servidor em `ws://<mesmo endereço>:2580`; em `trukenza.win`, em `wss://play.trukenza.win`.

## Variáveis (terminal ou `.env` local, fora do Git; modelo em `.env.example`)

- `TRUKENZA_BIND`: interface das portas. Padrão `127.0.0.1`. `0.0.0.0` abre para a rede local (para testar no celular na mesma rede); nunca no Orange Pi.
- `TRUKENZA_CLIENT_PORT`: porta do cliente (padrão 4180).
- `TRUKENZA_IP_HEADER`: `cf-connecting-ip` atrás do túnel. Sem ele, os limites por endereço contam todos como o mesmo (o conector do túnel).
- `TRUKENZA_MAX_ROOMS`: mesas abertas ao mesmo tempo (padrão 50, sem medição ainda; medir no Pi antes de subir).
- `TRUKENZA_METRICS`: `1` (padrão) grava uma linha JSON de métricas por minuto.
- `CLOUDFLARE_TUNNEL_TOKEN`: token do túnel nomeado.

## Playtest com túnel temporário

```powershell
$env:TRUKENZA_IP_HEADER='cf-connecting-ip'; docker compose --profile tunel up -d --build
docker compose logs tunel-servidor tunel-cliente | Select-String trycloudflare
```

Abra `https://<cliente>/?servidor=wss://<servidor>`; o "Copiar convite" já leva o `?servidor=`. Ao terminar: `docker compose --profile tunel down`.

## trukenza.win (túnel nomeado)

No ar desde 2026-11-08: túnel `trukenza`, rodando no Orange Pi (seção abaixo). Página em `https://trukenza.win`, servidor em `wss://play.trukenza.win`. Para refazer, no painel da Cloudflare (Networking → Tunnels, não o menu Zero Trust):
1. Criar o túnel `trukenza` e copiar só o token (o texto longo depois de `--token`, que começa com `eyJ`). Não instalar nada pelo painel. O painel só libera as rotas depois que o conector liga: subir o perfil `dominio` antes do passo 2.
2. Rotas do tipo *Published application* (o painel cria o DNS; conferir que o domínio escolhido é `trukenza.win`, o painel sugere outra zona da conta): `trukenza.win` → `http://client:8080`; `play.trukenza.win` → `http://server:2580`.
3. `.env` (no PC fora do Git; no Pi em `~/trukenza/.env`, modo 600) com `CLOUDFLARE_TUNNEL_TOKEN=<token>`, `TRUKENZA_IP_HEADER=cf-connecting-ip` e `TRUKENZA_MAX_ROOMS=20`.
4. `docker compose --profile dominio up -d` (no Pi com `--no-build --pull never`).

O token dá acesso ao túnel: quem o tiver publica qualquer coisa nesses endereços. Se vazar, gerar outro no painel (Rotate token) e trocar nos dois `.env`.

## Orange Pi

Em uso desde 2026-11-08, ao lado do Riscote e do XBrainia: conta `codex` (SSH só por chave, `~/.ssh/orangepi5-codex`), projeto em `/home/codex/trukenza`, portas em `127.0.0.1` e entrada pública só pelo túnel. `TRUKENZA_MAX_ROOMS=20` no `.env` do Pi, por prudência, igual ao Riscote, sem medição de carga ainda (uma mesa aberta: servidor com ~42 MB e menos de 1% de CPU). Para atualizar, construir aqui, levar as imagens prontas e carregar lá:

```powershell
docker buildx build --platform linux/arm64 --target server -t trukenza-server:arm64 --load .
docker buildx build --platform linux/arm64 --target client -t trukenza-client:arm64 --load .
docker save --platform linux/arm64 -o trukenza-arm64.tar trukenza-server:arm64 trukenza-client:arm64
```

```powershell
scp -i ~/.ssh/orangepi5-codex trukenza-arm64.tar compose.yaml codex@192.168.15.7:trukenza/
```

No Pi (`cd ~/trukenza`): conferir o `sha256sum` contra o do PC, `docker load -i trukenza-arm64.tar && rm trukenza-arm64.tar`, `docker tag trukenza-server:arm64 trukenza-server:latest`, `docker tag trukenza-client:arm64 trukenza-client:latest` e `docker compose --profile dominio up -d --no-build --pull never`. O servidor não grava nada: não há volume. Não usar `TRUKENZA_BIND=0.0.0.0` no Pi.

## Por que a imagem é assim

- O Node não remove tipos de arquivos dentro de `node_modules`: a imagem mantém o workspace do pnpm com `@trukenza/shared` e `@trukenza/game-engine` ligados por link, em vez de `pnpm deploy`.
- `init: true`: o Node como processo 1 não trata o sinal de parada.
- Containers sem root, só leitura (`/tmp` em memória), sem capabilities, `no-new-privileges`, limites de memória e de processos.
