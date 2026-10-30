# Arquitetura do Trukenza

## Camadas

```text
packages/game-engine   regras puras do Truco Espanhol (perfil GAUDERIO_24): baralho, vazas, Truco, Envido, Flor, placar, computador
packages/shared        mesa (cadeiras, pronto, anfitrião), protocolo, validação, personagens
apps/server            Colyseus: uma MesaRoom por mesa, autoritativa; HTTP GET /salas
apps/web               React + React Three Fiber: lobby, HUD e cena 3D; zustand para o estado local
```

- O motor de regras não sabe que existe rede ou tela. O servidor chama o motor e decide; o cliente só desenha e pede.
- `game-engine` e `shared` são TypeScript puro, sem DOM, sem relógio, com aleatoriedade por semente (`seededRandom`). Servem igualmente a um app nativo no futuro (React Native consome os mesmos pacotes; o protocolo é o mesmo).
- O cliente nunca importa o schema do servidor: lê o estado por reflexão (`net.ts` → `snapshot`) e copia para objetos simples na loja. A cena só lê a loja.

## O que veio do Riscote (`C:\Codes\riscote`)

| Aproveitado | Como ficou |
| --- | --- |
| Colyseus 0.18 com `@colyseus/core` + `ws-transport`, Node rodando TS direto | igual |
| Código de sala de 6 caracteres sem 0/O/1/I/L, `roomId` = código | igual (`protocol.ts`) |
| `markPeerAddress` (endereço real do socket, nunca o `X-Forwarded-For` do cliente), `limitJoins` (20 tentativas/min por endereço), `limitRooms` (teto de salas e 3 por endereço) | copiados (`joinLimit.ts`), cabeçalho `x-trukenza-peer` |
| Lista `GET /salas` com cache de 1 s, pública com código e nomes, privada só com contagem | copiada (`roomList.ts`); resumo próprio (cadeiras, jogadores, jogando) |
| Anfitrião = primeiro a chegar, passa ao seguinte | igual, dentro da `Table` |
| Queda: `onDrop` + `allowReconnection`, token em `sessionStorage` só para o servidor que o emitiu (`sessionForServer`) | igual; prazo de 60 s (cartas são mais lentas que plataforma) |
| Sala ociosa fecha com código próprio e aviso | igual (15 min sem mensagem) |
| `describeJoinError` (sala cheia = "locked") | igual, `maxClients` = cadeiras |
| Docker endurecido, `nginx-unprivileged`, multi-arquitetura, perfis `tunel` e `dominio` | igual, com portas próprias |
| Testes de sala com `@colyseus/testing` e subclasses de prazo curto | igual (`FastRoom`) |

| Não aproveitado | Por quê |
| --- | --- |
| Tick fixo, fila de comandos, previsão e interpolação | truco é por turnos: mensagens discretas bastam, sem simulação por quadro |
| Estado de jogo inteiro no schema | aqui há informação oculta (as mãos): vai por mensagem privada |
| Phaser e arte 2D | a mesa é 3D (three + React Three Fiber) |
| Placar de recordes em arquivo | a pontuação é por partida; sem volume de dados por enquanto |

## Servidor de mesas

- Uma `MesaRoom` por mesa (`ROOM_NAME = 'mesa'`). Opções de criação: `{ name, character, seats: 2 | 4, open, bots, rules: { goal, flor, turnSeconds } }`; de entrada: `{ name, character }`. Tudo validado (`parseName`, `parseCharacter`, `parseSeatCount`, `parseRules`).
- Estado sincronizado (`state.ts`): `seatCount`, `phase` (`espera` | `jogando`), `hostId`, regras (`goal`, `flor`, `turnSeconds`), `game` (JSON da `MatchView` pública e do relógio, vazio fora da partida), `players` (nome, personagem, cadeira, pronto, conectado, computador, **quantidade** de cartas) e `seats` (status e dono).
- Pedidos do cliente → `Table` (cadeiras, regras, começo) ou `SpanishMatch` (jogadas) → resultado. `ok` sincroniza; recusa vai como `recusa { text }` só para quem pediu; formato inválido é ignorado. `maxMessagesPerSecond = 20`.
- Caminhada: ao sentar, a cadeira fica `reservada` e um `clock.setTimeout(SIT_MS)` chama `settle`; se o jogador trocou de cadeira nesse meio-tempo, o `settle` antigo não vale.
- Começar: `Table.start` (anfitrião, mesa completa, todos prontos) → `new SpanishMatch(gauderio(regras), cadeiras, semente)` → `startHand()`.
- Jogada: `acao { type, card?, version }` → `parseAction` + versão igual à atual → `match.apply(cadeira, ação)`. Depois de toda mudança, `matchChanged()`:
  1. agenda a próxima decisão (`scheduleDecision`: relógio de quem decide, atraso do computador, tolerância de quem caiu, pausa entre mãos);
  2. grava `state.game`;
  3. manda a cada cliente a própria `mao { cards, actions, playable, version }`.
- Queda durante a partida: cadeira `desconectada` e cartas guardadas; o computador decide por ela se for preciso; ao voltar, a mão e as ações são reenviadas. Saída definitiva (ou prazo vencido): o computador assume a cadeira e a partida segue.
- Fim: com a meta alcançada a partida para; o anfitrião pede `revanche` (nova partida, mesmas cadeiras) ou `encerrar` (volta à espera).
- Computador: `completar` e `tirar-computador` (anfitrião, na espera) e a opção de criação `bots: true`. Os computadores vivem na `Table` e no estado (`bot: true`); a caminhada até a cadeira usa o mesmo `walkIn` das pessoas. Jogam pela `botAction` do motor.
- Variáveis de ambiente: comentário no topo de `apps/server/src/index.ts`.

## Cliente

- `App` mostra o lobby ou a mesa; a cena (`scene/MesaScene.tsx`) é `lazy`, então o three só baixa ao entrar.
- Cenário: o bolicho gaúcho vem de `public/modelos/bolicho.glb`, gerado por `assets/blender/bolicho.py` (sala, balcão com grade, garrafas, lareira, mesa e decoração numa malha só, com sombra de contato assada nos vértices; os brilhos e a cadeira à parte). `scene/Bolicho.tsx` põe as texturas de canvas (`bolichoTextures.ts`) pelo nome do material e faz o fogo tremular. As cadeiras são clones da `cadeira` do modelo, nos lugares de `layout.ts`.
- Luz (`MesaScene.tsx`): lampião como foco com sombra, fogo, janela e reflexos de ambiente montados com `Lightformer`; pós-processamento só no gráfico alto. O gráfico baixo fica com três luzes, sem sombra nem reflexos.
- Personagens: peças articuladas de `public/modelos/personagens.glb` (`assets/blender/personagens.py`), encaixadas num esqueleto comum (quadril, coxa/canela, tronco, braços, cabeça, olhos), igual para os quatro. Animações de andar, sentar, levantar, respirar, olhar e piscar valem para todos. A rota até a cadeira contorna a mesa por um anel e é calculada uma vez por destino.
- Câmera (`CameraRig`): terceira pessoa atrás do próprio personagem, seguindo a posição animada dele (de pé no arco de espera, andando até a cadeira, sentado). "Cartas de perto" é a opção em primeira pessoa, só sentado.
- Mão do jogador: `Hud` do drei com câmera própria, no centro de baixo da tela (no celular, acima da faixa de ações); as cartas dos outros aparecem viradas nas mãos dos personagens.
- Qualidade: "alta" (sombras, até 2× de resolução, antialias) ou "baixa"; celular começa na baixa; escolha lembrada.

## Próximas etapas verificáveis

Feito em 2026-10-24: variante Gaudério (`docs/regras.md`), motor da mão, jogadas na mesa e estratégia do computador, com testes de regra, de sala e partidas completas de 2 e 4.

1. **Outras modalidades** (quando pedidas): um perfil novo em `config.ts` e o que mudar de regra atrás dele; sala e cliente não mudam.
2. **Computador mais esperto**: lembrar das cartas já vistas, blefar Envido, jogar com o parceiro → verificar: taxa de vitória contra a versão atual em simulação.
3. **Personagens com expressão**: as peças do Blender já substituíram as primitivas (2026-10-24); faltam as animações de reação (comemorar, surpresa, frustração, cantar truco) e, se valer a pena, um rig com ossos → verificar: tamanho por personagem e qps num celular intermediário de verdade.
4. **Publicação** no Orange Pi pelo túnel `trukenza` → verificar: `https://trukenza.win` com dois aparelhos em redes diferentes.
