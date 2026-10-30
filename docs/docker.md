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

## trukenza.win (túnel nomeado) — pendente

Não feito: depende do titular (painel da Cloudflare). Passos, iguais aos do Riscote:
1. No painel da Cloudflare (Networking → Tunnels), criar o túnel `trukenza` e copiar o token. Subir o perfil `dominio` antes de criar as rotas.
2. Rotas do tipo *Published application*: `trukenza.win` → HTTP → `client:8080`; `play.trukenza.win` → HTTP → `server:2580`.
3. `.env` com `CLOUDFLARE_TUNNEL_TOKEN=<token>` e `TRUKENZA_IP_HEADER=cf-connecting-ip`.
4. `docker compose --profile dominio up -d --build`.

## Orange Pi — pendente

Mesmo processo do Riscote (`riscote/docs/docker.md`, seção Orange Pi): construir aqui, levar as imagens prontas, carregar e subir lá numa pasta própria (`/home/codex/trukenza`), com as portas em `127.0.0.1` e entrada pública só pelo túnel.

```powershell
docker buildx build --platform linux/arm64 --target server -t trukenza-server:arm64 --load .
docker buildx build --platform linux/arm64 --target client -t trukenza-client:arm64 --load .
docker save --platform linux/arm64 -o trukenza-arm64.tar trukenza-server:arm64 trukenza-client:arm64
```

No Pi: conferir o `sha256sum`, `docker load`, `docker tag … :latest` e `docker compose --profile dominio up -d --no-build --pull never`. O servidor não grava nada: não há volume.

## Por que a imagem é assim

- O Node não remove tipos de arquivos dentro de `node_modules`: a imagem mantém o workspace do pnpm com `@trukenza/shared` e `@trukenza/game-engine` ligados por link, em vez de `pnpm deploy`.
- `init: true`: o Node como processo 1 não trata o sinal de parada.
- Containers sem root, só leitura (`/tmp` em memória), sem capabilities, `no-new-privileges`, limites de memória e de processos.
