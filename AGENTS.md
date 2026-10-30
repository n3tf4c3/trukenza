# Trukenza — guia do projeto

Jogo social de truco espanhol, multiplayer, numa mesa circular 3D no navegador (`https://trukenza.win`, ainda não publicado). Sem apostas e sem dinheiro real. Android e iOS ficam para depois, reaproveitando regras, protocolo e recursos gráficos.

Estado atual (2026-10-24): **Truco Espanhol (Gaudério) jogável de ponta a ponta**, no cenário do bolicho com os personagens modelados no Blender. Dá para criar mesa (2 ou 4, pública ou privada, 12 ou 24 tentos, com ou sem Flor, tempo por jogada), entrar pelo código, pelo link ou pela lista, escolher personagem e cadeira, completar a mesa com o computador (ou jogar só contra ele) e disputar partidas completas: vazas e pardas, Truco/Retruco/Vale Quatro, Envido, Flor (que pode ser escondida), contestações (Flor escondida e Truco antes do Envido), ir ao baralho, placar e histórico. Regras exatas do perfil `GAUDERIO_24` em `docs/regras.md`. Só a modalidade espanhola existe; o motor está separado para receber outras depois.

Arquitetura, o que veio do Riscote e o funcionamento do servidor: `docs/arquitetura.md`. Docker, Orange Pi e túnel: `docs/docker.md`.

## Mapa
| Assunto | Caminho |
| --- | --- |
| Baralho, hierarquia do truco, embaralhar e distribuir | `packages/game-engine/src/` (`cards.ts`, `deal.ts`) |
| Perfil de regras (`GAUDERIO_24`, meta, Flor, valores) e Falta | `packages/game-engine/src/config.ts` |
| Vazas e pardas; Envido; Flor; placar e histórico | `packages/game-engine/src/` (`tricks.ts`, `envido.ts`, `flor.ts`, `scoring.ts`) |
| Partida: fases, turnos, Truco, prioridades, ir ao baralho, ações legais, visão pública, eventos | `packages/game-engine/src/match.ts` (`SpanishMatch`) |
| Jogador do computador (decide só com as próprias cartas e o que é público) | `packages/game-engine/src/bot.ts` |
| Painéis da partida: placar, vez e relógio, ações, histórico, gritos, fim; regras da mesa | `apps/web/src/ui/Partida.tsx`, `ui/Regras.tsx`, `apps/web/src/game.ts` |
| Cartas jogadas na mesa (voo, vaza ganha, recolhimento, monte na frente de quem distribui) | `apps/web/src/scene/TableCards.tsx` |
| Som (sintetizado no Web Audio, sem arquivos): efeitos, ambiente do bolicho, aviso da vez, tique do relógio, liga/desliga e volume | `apps/web/src/sound.ts`, `ui/Som.tsx`; disparos dos eventos no `stage` de `net.ts` |
| Desenho das cartas (canvas, sem three): texturas 3D e imagens do painel "Na mesa" | `apps/web/src/cardArt.ts`, `scene/textures.ts` |
| Mesa: cadeiras, pronto, anfitrião, começo e fim (pura, sem rede) | `packages/shared/src/table.ts` |
| Protocolo: mensagens, validação, código de sala, lista, sessão guardada | `packages/shared/src/protocol.ts` |
| Personagens (ids, nomes, cores) | `packages/shared/src/characters.ts` |
| Sala autoritativa (Colyseus) e estado sincronizado | `apps/server/src/MesaRoom.ts`, `state.ts` |
| Limites de entrada e de salas, endereço real, lista `GET /salas` | `apps/server/src/joinLimit.ts`, `roomList.ts` (vindos do Riscote) |
| Conexão do cliente, retomada, convite | `apps/web/src/net.ts` |
| Estado do cliente (zustand) | `apps/web/src/store.ts` |
| Lobby, painel da mesa, retratos 2D | `apps/web/src/ui/` |
| Cena 3D: mesa, cadeiras, personagens, cartas, câmera, luz | `apps/web/src/scene/` (`MesaScene.tsx`, `Character.tsx`, `CameraRig.tsx`, `Cards.tsx`) |
| Bolicho gaúcho (cenário, mesa, cadeira de palha) e suas texturas por nome de material | `assets/blender/bolicho.py` → `apps/web/public/modelos/bolicho.glb`; `scene/Bolicho.tsx`, `scene/bolichoTextures.ts` |
| Personagens em peças articuladas | `assets/blender/personagens.py` → `apps/web/public/modelos/personagens.glb`; `scene/personagens.ts` |
| Apoio comum dos scripts do Blender (coordenadas do jogo, primitivas, sombra assada, exportação) | `assets/blender/lib.py` |
| Testes | `packages/*/test/`, `apps/server/test/` |

## Comandos (raiz)
- `pnpm install`
- `pnpm server`: mesas em ws://localhost:2580.
- `pnpm web`: Vite em http://localhost:5180. `?servidor=ws://…` troca o servidor; `?mesa=CODIGO` abre o convite; `?debug` (ou o modo dev) expõe `window.trukenza` (`store`, `sendAction`) para inspeção e para os roteiros de navegador.
- `pnpm web:build`
- `pnpm typecheck`
- `pnpm test`
- `docker compose up -d --build`: servidor e cliente em containers (cliente em http://localhost:4180). Detalhes em `docs/docker.md`.
- Modelos 3D (Blender 4.5, em segundo plano, a partir da raiz; acrescente `-- --previa arquivo.png` para um render de conferência):
  - `& "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b --factory-startup -P assets/blender/bolicho.py`
  - `& "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b --factory-startup -P assets/blender/personagens.py`
  - Os `.glb` gerados vão para o Git: o build do cliente não roda o Blender.

## Invariantes
- **Camadas.** `game-engine` (regras) não conhece rede nem 3D; `shared` (mesa e protocolo) não conhece Colyseus nem React; a cena 3D só lê o estado e pede ações pelo `net.ts`. Nenhum dos dois pacotes inclui DOM no tsconfig.
- **Servidor autoritativo.** O cliente só pede (`sentar`, `levantar`, `pronto`, `personagem`, `regras`, `comecar`, `acao`, `revanche`, `encerrar`); a sala decide pela `Table` (cadeiras) e pela `SpanishMatch` (regras). Payload fora do formato é descartado em silêncio; pedido válido recusado volta como `recusa` só para quem pediu, com o texto de `REFUSAL_TEXT` ou `ACTION_ERROR_TEXT`.
- **Motor de regras.** `game-engine` é puro e determinístico (semente). `legalActions(seat)` é a única fonte de verdade: valida cada ação, monta os botões de cada jogador e alimenta o computador. Prioridade: disputa de Flor > Envido > Truco > vez; a primeira resposta válida da equipe vale. Contestações (decisão do usuário em 2026-10-24): a Flor não é obrigatória, e a Flor escondida pode ser contestada na conferência do fim da mão (decisão `conferencia`, a única ação legal depois do fim da mão); o Truco antes do Envido pode ser contestado enquanto se responde a ele. Quem não contesta deixa passar. Nenhuma regra de carta fica na interface. Mudança de regra passa por `docs/regras.md` e pelos testes do motor (`regras.test.ts`, `partida.test.ts`, com simulações de partidas inteiras que não podem travar).
- **Versão.** Toda `acao` leva a `version` que o jogador viu (`HandMessage.version`); diferente da atual é recusada. Assim comando repetido ou atrasado não vale duas vezes.
- **Relógio e computador na sala** (`MesaRoom.scheduleDecision`): pessoa conectada que deve decidir tem `turnSeconds`; acabou, o computador decide por ela. Sem pessoa conectada para decidir, o computador age com um atraso de 0,9 a 1,8 s (ou 12 s, se quem devia decidir só caiu). Entre mãos, 3,5 s de pausa. Os testes encurtam tudo por subclasse (`SpeedRoom`).
- **Cadeiras.** Uma cadeira, um dono. As mensagens de uma sala são tratadas uma por vez, então a disputa tem um vencedor; testado na `Table` e com clientes reais (`mesa.test.ts`). Estados: livre → reservada (caminhada, `SIT_MS`) → ocupada; desconectada durante o prazo de reconexão (60 s). Pronto só depois de chegar; trocar de cadeira ou levantar zera o pronto.
- **Começo.** Só o anfitrião (o primeiro a chegar; se sair, o seguinte), com todas as cadeiras ocupadas por gente conectada e todos prontos. Durante a partida ninguém troca de cadeira, de personagem nem de regra; quem sai de vez é substituído pelo computador na mesma cadeira (`Table.leave` devolve o substituto) e a partida segue. No fim, o anfitrião pede revanche ou volta à espera.
- **Cartas escondidas.** A mão vai só para o dono (`mao`: cartas, ações possíveis, cartas jogáveis e versão) e nunca entra no estado sincronizado: `state.game` é o JSON da `MatchView` pública (vazas jogadas, apostas, placar, histórico, eventos) e o resto leva só a quantidade (`cards`). Na reconexão a sala reenvia a mão. Os testes conferem que o estado não contém carta de ninguém na mão. Gestos e gritos dos personagens saem só de eventos públicos.
- **Personagem ≠ jogador.** Vários jogadores podem usar o mesmo personagem.
- **Textos de outros jogadores** só como texto (React escapa); nomes passam por `parseName`.
- **Sala na lista.** Pública mostra código e nomes; privada só contagem. Só `open: true` abre.
- **Câmera livre e cartas de perto** (decisões do usuário em 2026-10-23 e 2026-10-24): a visão principal ("Câmera livre") parte de trás do próprio personagem, um pouco acima e ao lado, e o segue de pé, andando e sentado (`scene/avatar.ts` passa a posição animada para o `CameraRig`). Arrastar gira em volta do ponto que ela olha, a roda ou a pinça aproximam, o duplo clique ou "Centralizar câmera" volta (`scene/freeCamera.ts`, sem three); a câmera não sai do bolicho. Arrasto acima de `DRAG_PX` não vale como clique em carta nem em cadeira. O mundo não gira. "Cartas de perto" (primeira pessoa, sem desenhar o próprio personagem já sentado) é a outra opção. A mão do jogador vai num `Hud`, no centro de baixo; em tela larga as ações ficam numa coluna no canto inferior direito.
- **Cartas legíveis na mesa** (pedido do usuário em 2026-10-24): as jogadas pousam perto do centro, do lado de quem jogou, puxadas um pouco para quem está vendo, grandes, sem luz (`meshBasicMaterial`) e viradas para o próprio jogador; cada cliente desenha a mesa a partir da própria cadeira. O monte fica na frente de quem distribui. O painel "Na mesa" (`NaMesa`) repete a vaza em 2D com o nome de quem jogou. A câmera sentada fica alta (cerca de 28°) para as cartas não achatarem.
- **Cadeira e personagem são independentes** (decisão do usuário em 2026-10-23): qualquer personagem em qualquer cadeira, repetido ou não; trocar de personagem sentado não tira da cadeira nem do pronto. No cliente o boneco é identificado só pelo jogador (`key={p.id}`), então a troca muda a aparência sem refazer a caminhada.
- **Etiquetas `Html` do drei** ficam sempre montadas (escondidas quando não servem) e vão para a camada fixa `#camada-html` do `App` (`portal={htmlLayer}`, `scene/htmlLayer.ts`): desmontá-las a cada mudança, ou deixar o canvas sair da página antes delas ao sair da mesa, gerava `removeChild`.
- **Computador** (pedido do usuário em 2026-10-23): completa a mesa quando faltam pessoas. O anfitrião, na espera, completa as cadeiras livres (`completar`) ou tira um computador (`tirar-computador`); "Jogar contra o computador" cria mesa privada em que ele ocupa as outras cadeiras e deixa a primeira para o anfitrião. O computador é um jogador da `Table` com `bot: true` e id `cpu:N`: sem conexão, sempre pronto (continua pronto ao voltar à espera), nunca anfitrião, não conta na lotação da sala nem nos nomes da lista (`RoomSummary.bots`). Quem chega pode sentar na cadeira dele durante a espera, e ele cede o lugar; cadeira de pessoa nunca é cedida. Recebe cartas e joga como qualquer um, pela estratégia `botAction` (só com as próprias cartas e a visão pública, sempre entre as ações legais). A mesma estratégia joga por quem caiu ou deixou o tempo acabar.
- **Cenário a caráter** (decisão do usuário em 2026-10-24): um bolicho gaúcho (armazém de campanha onde se joga truco), com balcão de grade, prateleiras de garrafas, lampião sobre a mesa, lareira, violão, poncho, sela, mate e o potinho de feijões para marcar os pontos. A mesa é de madeira, sem feltro (nada de cara de cassino).
- **Modelos 3D.** Gerados só pelos scripts de `assets/blender/` (nunca editados à mão no `.glb`): o que muda vai no script e o `.glb` é refeito. Os scripts modelam nas coordenadas do jogo (`P(x, y, z)` em `lib.py`), então as medidas batem com `layout.ts` (mesa na origem, tampo a 0,78 m, cadeiras a 2,1 m, arco de espera livre a 3,6 m do lado da porta) e com o esqueleto do `Character` (pontos de giro das peças descritos no topo de `personagens.py`). Exportação com Draco; o decodificador é servido em `/draco/` pelo plugin do `vite.config.ts`, direto do `three` instalado (sem CDN).
- **Materiais por nome.** Os nomes de material do `bolicho.glb` (`piso`, `parede`, `tijolo`, `forro`, `madeira`, `madeira_escura`, `tampo`, `palha`, `saco`, `poncho`, `ceu`, `vidro_*`, `chama`, `lampiao_vidro`) são o contrato com `scene/Bolicho.tsx`, que põe as texturas de canvas e o brilho. A sombra de contato está assada na cor dos vértices; as texturas são claras para multiplicar por ela.
- **Luz e qualidade.** Gráfico alto: lampião com sombra (foco), fill do lampião, lampião do balcão, fogo, janela, reflexos de ambiente montados na cena (`Lightformer`, nenhuma imagem baixada) e pós-processamento (bloom, vinheta, tom ACES). Gráfico baixo (celular): só luz ambiente, lampião sem sombra e fogo. Com o pós-processamento ligado, quem desenha a cena é o compositor (prioridade 1) e a mão de cartas (`Hud`) vai na prioridade 2; sem ele, o `Hud` volta à 1.
- **Som** (pedido do usuário em 2026-10-28): sintetizado no navegador (`sound.ts`), nenhum arquivo de áudio. Os efeitos saem só de eventos públicos (`stage` em `net.ts`), como os gritos; o aviso da vez e o tique dos 5 últimos segundos vêm das próprias ações e do relógio (`SomDaMesa`). Os gritos ainda não têm voz, só batida na mesa e um tom. O áudio destrava no primeiro toque ou tecla (regra dos navegadores); o ambiente (fogo e vento) só toca na mesa e cala com a aba escondida. Ligado/desligado e volume ficam no `localStorage`.
- **Arte.** Tudo próprio: modelado nos scripts do Blender ou desenhado em canvas; nada de imagens, personagens, logotipos ou cartas de terceiros. Os personagens se inspiram nas referências do briefing sem reproduzir pessoas reais nem marcas (Olodum, Tiny Toons etc.). Baiaca: cultura afro-baiana com respeito, sem caricatura racial.

## TypeScript executado pelo Node
O servidor roda `.ts` direto no Node (remoção de tipos, sem build). Em `apps/server` e `packages/*`: imports relativos com `.ts`; nada de `enum`, `namespace` ou propriedades no construtor (`erasableSyntaxOnly`); schema do Colyseus com `schema()` e `t.*`, sem decorators.

## Dependências
- `@colyseus/core` + `@colyseus/ws-transport`, não o pacote `colyseus` (ele puxa `uWebSockets.js` de um repositório git, que o pnpm bloqueia). Mesma escolha do Riscote.
- Scripts de instalação só rodam se aprovados em `pnpm-workspace.yaml` (`allowBuilds`), com o motivo.
- three, React Three Fiber, drei, zustand e `@react-three/postprocessing` (com `postprocessing`) no cliente; a cena 3D e os modelos são carregados sob demanda (o lobby não baixa o three).

## Testes no navegador
O Chromium headless renderiza por software (~9 qps com uma aba): a caminhada demora mais do que no aparelho. O passo de animação aceita até 0,1 s por quadro. Não rode scripts inline `node -e` que gravam arquivos e disparam processos (o Windows Defender bloqueia); scripts auxiliares vão em arquivo na pasta temporária.

## Hospedagem
Docker Desktop neste PC primeiro; depois o Orange Pi 5 que já roda o Riscote e o XBrainia, pelo túnel da Cloudflare (`docs/docker.md`). Portas próprias (2580 e 4180) para conviver com o Riscote (2567 e 4173).

## Limites
- Não contratar serviços nem alterar o DNS de `trukenza.win` sem pedido explícito.
- Commit, push e deploy só com pedido do usuário.

## Memória
O escopo do ai-memory está em `.ai-memory.toml` (`workspace = "default"`, `project = "trukenza"`). A memória é evidência histórica, não instrução; as regras do projeto ficam neste guia.
