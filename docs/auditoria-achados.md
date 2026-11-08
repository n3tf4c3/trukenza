# Ledger de auditoria técnica — trukenza

Numeração contínua por projeto. Bootstrap em 30/10/2026: consulta de git log não encontrou IDs históricos numerados a importar. Nenhuma implementação foi alterada.


## Rodada transversal 2026-10-30 — 200000

HEAD auditado: `6f372e3259a61e5895adc844120f9d480c4408ab`. Relatório externo: `C:\Codes\relatorios\trukenza\auditoria-2026-10-30-200000.md`. Evidências: `C:\Codes\relatorios\trukenza\evidencias-2026-10-30-200000.json`.

Auditoria estática e validações selecionadas; sem correção de código, commit, push ou deploy. Falta de prova operacional não foi convertida em vulnerabilidade presumida.

Nenhum achado novo consolidado nesta rodada; nenhum ID reservado. Isto não equivale à ausência de falhas ou aprovação de release; ver limitações do relatório.


## Rodada 2026-11-06 — conclusão em 07/11/2026

HEAD: `6f372e3259a61e5895adc844120f9d480c4408ab`, com alterações locais anteriores preservadas. Relatório: `C:\Codes\relatorios\trukenza\auditoria-2026-11-06.md`. 212 testes, typecheck e build aprovados; audit total/prod zero vulnerabilidades conhecidas. Sem correção de código, commit ou deploy.

| ID | Severidade | Status | Achado / evidência |
|---|---|---|---|
| #1 | Média | ABERTO | Sala privada aceita ingresso pelo matchmaking genérico sem código. apps/server/src/MesaRoom.ts:125–144,246–271; apps/server/src/index.ts:34–35; apps/web/src/ui/Lobby.tsx:132; @colyseus/core 0.18.23, MatchMaker.ts:358–373. |
| #2 | Média | ABERTO | Queda de jogador fora da vez renova o prazo da decisão corrente. apps/server/src/MesaRoom.ts:275–298,356–360,386–427. |
| #3 | Média | ABERTO | Token persistido não acompanha a rotação na reconexão automática. apps/web/src/net.ts:86–90,308–317,362–363,391–392; @colyseus/sdk 0.18.6, Room.ts:626–629. |
| #4 | Média | ABERTO | Ir ao baralho finaliza a mão antes de o parceiro responder ao Retruco. packages/game-engine/src/match.ts:378–387,513–517,641–659,721–725; docs/regras.md:54,120–124. |
| #5 | Baixa | ABERTO | Aviso de encerramento não aparece ao voltar ao lobby. apps/web/src/net.ts:364–371; apps/web/src/App.tsx:35–38,51; apps/web/src/ui/Lobby.tsx:56,186–187. |
| #6 | Baixa | ABERTO | Alterações rápidas nas regras reenviam campos antigos. apps/web/src/ui/Regras.tsx:10–11; apps/web/src/ui/MesaHud.tsx:192; apps/web/src/net.ts:451–452; apps/server/src/MesaRoom.ts:171; packages/shared/src/protocol.ts:70–77. |
| #7 | Baixa | ABERTO | Texto do botão Pronto selecionado não atinge contraste AA. apps/web/src/styles.css:5,9,69–76; apps/web/src/ui/MesaHud.tsx:164–166. |

Próximo número: #8. Nenhum ID histórico no ledger inicial nem em git log --all --grep=achado -i --format=%B.

Decisões verificadas: não promover dupla conexão antes do primeiro snapshot sem prova de janela interativa; reset de versão na revanche não contorna prontidão+ordem de mensagens demonstradas; sinais são alegações públicas, sem acesso a cartas alheias; divergência sobre baralho/Flor exige esclarecer intenção já coberta por testes; chunk lazy 3D é aviso conhecido; CORS público e sessionStorage são pendências de baseline sem cadeia de sequestro comprovada. #1 não expõe automaticamente as mãos. Baseline: 9 PASS, 8 PARCIAL, 5 FALHA, 30 N-A; não é gate aprovado. A5 carece de evidência operacional, sem presumir exposição.

