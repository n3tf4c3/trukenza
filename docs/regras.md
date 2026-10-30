# Regras do Truco Espanhol — perfil `GAUDERIO_24`

Implementadas em `packages/game-engine` (puro, sem rede nem tela) e aplicadas pelo servidor. Este documento descreve exatamente o que o motor faz. Os números ficam em `config.ts`, e uma partida usa um só perfil do começo ao fim.

Configuração da sala (o anfitrião escolhe na espera; travada durante a partida):
- 2 jogadores (mano a mano) ou 4 (duas duplas, parceiros frente a frente: cadeiras 1 e 3 contra 2 e 4).
- Meta de **12 ou 24 tentos** (padrão 24). Na de 24, de 0 a 11 são as *malas* e de 12 a 23 as *boas*.
- **Flor** ligada (padrão) ou desligada.
- Tempo de cada jogada ou resposta: 15, 30 (padrão) ou 60 s. Quando o tempo acaba, o computador decide por quem deixou acabar.
- Sala pública ou privada.

O personagem é só aparência: não muda regra nem força de carta.

## Baralho e força das cartas

40 cartas (espadas, paus, ouros e copas; de 1 a 7 e 10, 11, 12), sem 8, 9 nem curinga. Não há vira, e as manilhas são fixas. Três cartas para cada jogador.

| Força | Cartas |
| --- | --- |
| 1 | 1 de espadas (Espadão) |
| 2 | 1 de paus (Bastião) |
| 3 | 7 de espadas |
| 4 | 7 de ouros (Sete Belo) |
| 5 | os 3 |
| 6 | os 2 |
| 7 | 1 de copas e 1 de ouros |
| 8 | os 12 (Reis) |
| 9 | os 11 (Cavalos) |
| 10 | os 10 (Sotas) |
| 11 | 7 de copas e 7 de paus |
| 12 | os 6 |
| 13 | os 5 |
| 14 | os 4 |

Mesma força empata; o naipe não desempata (`trucoPower` e `compareCards` em `cards.ts`).

## Ordem da mesa, mão e vazas

- **Ordem:** "à direita" é a cadeira seguinte (índice + 1). Quem distribui gira para a direita a cada mão; o primeiro a distribuir é sorteado.
- **O mão** é quem está à direita de quem distribui. Ele abre a primeira vaza e tem prioridade nos desempates.
- **Jogada:** cada um joga uma carta por vez. A carta mais forte leva a vaza.
  - Se as mais fortes forem de dois parceiros, a vaza é da dupla, e abre a seguinte quem jogou primeiro entre eles.
  - Se forem de equipes diferentes, é **parda**.
- **Vaza seguinte:** abre quem ganhou a anterior. Depois de uma parda, abre o mão (ou o próximo ainda na mão, se ele foi ao baralho).
- **Quem ganha a mão** (`handWinner` em `tricks.ts`):
  - Duas vazas ganham.
  - Parda na primeira: decide a segunda.
  - Parda também na segunda: decide a terceira.
  - Ganhou a primeira e empatou a segunda: ganha quem ganhou a primeira.
  - Uma para cada e parda na terceira: ganha quem ganhou a primeira.
  - Três pardas: ganha a equipe do mão.
  - A mão acaba assim que o resultado está definido.

Prioridade das decisões durante a mão: **disputa de Flor > Envido > Truco > vez de jogar**. Enquanto há um pedido sem resposta, ninguém joga carta. Pode responder qualquer jogador ainda na mão da equipe que deve responder; vale a primeira resposta, e as seguintes já não são legais.

## Truco, Retruco e Vale Quatro

A mão começa valendo 1 tento.

| Pedido | Aceito | Recusado (para quem pediu) |
| --- | ---: | ---: |
| Truco | 2 | 1 |
| Retruco | 3 | 2 |
| Vale Quatro | 4 | 3 |

- Pede-se na própria vez de jogar. A resposta pode ser Quero, Não Quero ou o aumento seguinte, que aceita o pedido anterior e propõe o próximo.
- Depois de um pedido aceito, só a equipe que aceitou pode aumentar, e só na vez dela. Assim ninguém pula etapa nem aumenta duas vezes seguidas.
- Recusar acaba a mão: quem pediu leva o valor que estava estabelecido antes do pedido.
- Ao primeiro Truco, ainda na primeira vaza, quem responde pode antes abrir o Envido (se tiver direito). O Truco fica esperando, o Envido é resolvido e pontuado, e depois volta a resposta ao Truco. O Envido não muda o valor do Truco.
- **Decisão do perfil:** Truco aceito sem o Envido cantado fecha o Envido daquela mão.
- **Truco antes do Envido** (pode ser contestado): na primeira vaza, com o Envido ainda aberto, a equipe do mão pede Truco antes de a outra equipe ter tido a vez de cantar o Envido (nenhum dos seus que podem abri-lo jogou ainda; na mesa de 4, os dois últimos da ordem).
  - Enquanto responde a esse Truco, a outra equipe pode **contestar**: o Envido da mão queima (ninguém mais canta nem pontua Envido) e a equipe infratora perde **2 tentos** (sem ficar abaixo de 0). O Truco continua esperando a resposta.
  - Se ela responde sem contestar (Quero, Não Quero, aumento, Envido, Flor ou baralho), fica por isso mesmo.

## Envido

- **Pontos:** com duas cartas do mesmo naipe, as duas de maior soma mais 20. Sem par de naipe, vale a maior carta sozinha. Figuras (10, 11, 12) valem 0; o máximo é 33.
- **Na dupla,** vale o maior Envido de cada equipe, não a soma dos parceiros. Empate: ganha quem vem primeiro a partir do mão.
- **Quando:** só na primeira vaza, e só quem ainda não jogou a primeira carta.
  - No mano a mano, os dois podem abrir.
  - Na mesa de 4, só os dois últimos da ordem da primeira vaza podem abrir. Responder pode qualquer um da equipe.
- **Cantos** (máquina de estados em `envido.ts`): até dois Envidos, depois Real Envido e por fim Falta Envido. Nada depois da Falta.

| Cantos | Aceito | Recusado |
| --- | ---: | ---: |
| Envido | 2 | 1 |
| Envido + Envido | 4 | 2 |
| Real Envido | 3 | 1 |
| Envido + Real Envido | 5 | 2 |
| Envido + Envido + Real Envido | 7 | 4 |
| … + Falta Envido | a Falta | o que estava antes dela (mínimo 1) |

A recusa vale a soma dos cantos anteriores ao último, no mínimo 1. A **Falta** é calculada na hora: a meta menos o placar de quem está na frente (24 a 10 × 16 → 8).

Ao aceitar, os dois lados "cantam" o maior Envido (a tela mostra os dois números). Os pontos entram na hora e podem acabar a partida.

## Flor (ligada por padrão)

- **O que é:** três cartas do mesmo naipe. Os pontos para comparar duas Flores são a soma das três mais 20 (figuras valem 0; 7, 6 e 5 de espadas = 38).
- **Não é obrigatória:** quem tem Flor pode anunciá-la na própria vez, ao responder a um Truco ou ao responder a um Envido (que fica anulado), sempre antes de jogar a primeira carta e enquanto o Envido não se resolveu. Pode também escondê-la e jogar o Envido com as duas melhores.
- **Flor escondida (conferência no fim da mão):** se uma equipe levou pontos de Envido na mão, a outra pode **contestar** até começar a mão seguinte (a pausa entre mãos fica mais longa, 9 s).
  - Quem ganhou o Envido aceito mostra as três cartas no fim da mão; as cartas jogadas também ficam à vista.
  - Procede se alguém da equipe que levou o Envido tinha Flor, não a anunciou e as três cartas dele ficaram à vista. Aí os pontos do Envido passam para quem contestou.
  - Contestação sem Flor à vista não muda nada. Sem contestar, fica por isso mesmo. O tempo não contesta por ninguém.
  - A conferência acontece sempre que alguém levou Envido com a Flor ligada, haja Flor escondida ou não, para não denunciar nada. Se os pontos do Envido acabam a partida, não há conferência.
- **Todas de uma vez:** quando a primeira Flor é anunciada, saem juntas as Flores de todos que ainda não jogaram a primeira carta.
- **Prioridade:** a Flor anula o Envido da mão e é resolvida antes de continuar as vazas. Se os pontos dela acabam a partida, as vazas não são jogadas.
- **Valores no `GAUDERIO_24`:**
  - Flor de um lado só: 3 tentos por Flor. Os dois parceiros com Flor somam 6.
  - Flor dos dois lados: disputa. A aposta básica vale 3 por Flor participante, e responde a equipe de quem não anunciou primeiro:
    - **Quero:** comparam-se as Flores, e a melhor leva a básica.
    - **Contra-Flor:** se aceita, vale o dobro da básica.
    - **Contra-Flor e o Resto:** se aceita, vale a Falta.
    - **Me Achico:** quem propôs leva o nível estabelecido antes do último aumento (a básica, se ainda não houve aumento aceito).
  - Desempate pela ordem a partir do mão.
- **Flor desligada:** três cartas do mesmo naipe contam só como Envido (as duas melhores).

## Ir ao baralho, recusar, cair e sair

- **Ir ao baralho** (na própria vez, ou para responder a um pedido): o jogador larga as cartas sem mostrá-las.
  - No mano a mano, a outra equipe leva o valor do Truco já estabelecido.
  - Na dupla, o parceiro continua com as próprias cartas (quem foi ao baralho é pulado). Se a equipe toda for, ela desiste da mão:
    - um Envido ou uma Flor que ela devia responder conta como recusa (pontuado primeiro);
    - depois, a outra equipe leva o valor do Truco.
  - Não dá para ir ao baralho com um pedido da própria equipe esperando resposta.
- **Recusar** (Não Quero ou Me Achico) resolve só aquela aposta. Só o Truco recusado acaba a mão.
- **Cair** (perder a conexão): a cadeira e as cartas ficam guardadas por 60 s. Se for a vez dela, o computador decide depois de 12 s; ao voltar, a pessoa recebe as cartas e o estado de volta.
- **Sair da sala** no meio da partida: o computador assume a mesma cadeira, com as mesmas cartas, e a partida segue.

## Placar

- Truco, Envido e Flor pontuam separadamente, na ordem em que se resolvem. Envido e Flor entram na hora; o Truco entra no fim da mão.
- As contestações entram no histórico como "contestacao": a penalidade com valor negativo (o que de fato saiu do placar) e, na Flor escondida, o ganho de quem contestou.
- Cada aposta tem uma chave única por mão (não pontua duas vezes), e ao alcançar a meta a partida acaba imediatamente.
- O histórico guarda, para cada linha, a mão, o tipo, o detalhe ("Truco recusado", "Envido + Real Envido"…), o valor, a equipe e o placar resultante.

## O que o servidor garante

O cliente só pede. Quem distribui, a força das cartas, o vencedor de cada vaza, o Envido, a Flor, os pontos, a ordem dos turnos e a validade de cada aposta saem do motor no servidor:
- Cada jogador recebe só as próprias cartas e a lista do que pode fazer agora.
- Cada jogada leva a versão do estado que o jogador viu; versão velha é recusada (comando repetido ou atrasado não vale duas vezes).
- Ação fora da vez, carta que não está na mão e aumento ilegal são recusados com aviso.
