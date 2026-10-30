import { useEffect, useState } from 'react';
import { CHARACTERS, CHARACTER_IDS, DEFAULT_RULES, NAME_MAX, normalizeRoomCode, parseName, type RoomRules, type RoomSummary, type SeatCount } from '@trukenza/shared';
import { createRoom, fetchRooms, invitedCode, joinRoom } from '../net';
import { useStore } from '../store';
import { Portrait } from './Portrait';
import { RulesPicker } from './Regras';

const ROOM_LIST_MS = 5000;
const NAME_HINT = `Nome: até ${NAME_MAX} letras ou números; vale espaço, ponto, hífen e sublinhado.`;

export function CharacterPicker({ value, onPick }: { value: string; onPick: (id: (typeof CHARACTER_IDS)[number]) => void }) {
  return (
    <div className="personagens" role="radiogroup" aria-label="Personagem">
      {CHARACTER_IDS.map((id) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? 'escolhido' : ''} onClick={() => onPick(id)}>
          <Portrait character={id} size={72} />
          <strong>{CHARACTERS[id].name}</strong>
          <small>{CHARACTERS[id].tagline}</small>
        </button>
      ))}
    </div>
  );
}

/** Salas públicas no servidor, consultadas enquanto o lobby está na tela e a aba, visível. */
function useRooms(): RoomSummary[] | null | 'erro' {
  const [rooms, setRooms] = useState<RoomSummary[] | null | 'erro'>(null);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      if (document.visibilityState !== 'visible') return;
      const list = await fetchRooms();
      if (alive) setRooms(list ?? 'erro');
    };
    void refresh();
    const timer = setInterval(() => void refresh(), ROOM_LIST_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return rooms;
}

export function Lobby({ initialStatus }: { initialStatus: string }) {
  const { name, character, setName, setCharacter } = useStore();
  const [seats, setSeats] = useState<SeatCount>(4);
  const [open, setOpen] = useState(true);
  const [rules, setRules] = useState<RoomRules>(DEFAULT_RULES);
  const [code, setCode] = useState(invitedCode ?? '');
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const rooms = useRooms();

  /** Nome vazio vale (o servidor dá "Jogador N"); inválido, avisa. */
  function nameOk(): boolean {
    if (name.trim() === '' || parseName(name)) return true;
    setStatus(NAME_HINT);
    return false;
  }

  async function run(action: () => Promise<string | null>): Promise<void> {
    if (!nameOk()) return;
    setBusy(true);
    setStatus('');
    const error = await action();
    setBusy(false);
    if (error) setStatus(error);
  }

  function join(raw: string): void {
    const valid = normalizeRoomCode(raw);
    if (!valid) {
      setStatus('O código tem 6 letras ou números.');
      return;
    }
    void run(() => joinRoom(valid));
  }

  const invited = invitedCode ? normalizeRoomCode(invitedCode) : null;

  return (
    <main className="lobby">
      <header>
        <h1>Trukenza</h1>
        <p>Truco espanhol com os amigos, numa mesa de verdade.</p>
      </header>

      <section className="cartao">
        <label className="campo">
          Seu nome
          <input value={name} maxLength={NAME_MAX * 2} placeholder="Como te chamam na mesa" onChange={(e) => setName(e.target.value)} />
        </label>
        <h2>Personagem</h2>
        <CharacterPicker value={character} onPick={setCharacter} />
      </section>

      {invited && (
        <section className="cartao convite">
          <h2>Convite para a mesa {invited}</h2>
          <button type="button" className="principal" disabled={busy} onClick={() => join(invited)}>
            Entrar na mesa
          </button>
        </section>
      )}

      <div className="colunas">
        <section className="cartao">
          <h2>Criar mesa</h2>
          <div className="grupo" role="group" aria-label="Jogadores">
            {([2, 4] as const).map((n) => (
              <button key={n} type="button" aria-pressed={seats === n} onClick={() => setSeats(n)}>
                {n === 2 ? '2 jogadores · mano a mano' : '4 jogadores · duplas'}
              </button>
            ))}
          </div>
          <div className="grupo" role="group" aria-label="Visibilidade">
            <button type="button" aria-pressed={open} onClick={() => setOpen(true)}>
              Pública
            </button>
            <button type="button" aria-pressed={!open} onClick={() => setOpen(false)}>
              Privada
            </button>
          </div>
          <p className="dica">{open ? 'Aparece na lista com o código e os nomes.' : 'Só entra quem tiver o código ou o link.'}</p>
          <h2>Regras</h2>
          <RulesPicker value={rules} onChange={setRules} />
          <div className="linha">
            <button type="button" className="principal" disabled={busy} onClick={() => void run(() => createRoom(seats, open, false, rules))}>
              Criar mesa
            </button>
            <button type="button" disabled={busy} onClick={() => void run(() => createRoom(seats, false, true, rules))}>
              Jogar contra o computador
            </button>
          </div>
          <p className="dica">Contra o computador a mesa é privada; ainda dá para chamar amigos pelo convite, e eles sentam no lugar do computador.</p>
        </section>

        <section className="cartao">
          <h2>Entrar com código</h2>
          <form
            className="linha"
            onSubmit={(e) => {
              e.preventDefault();
              join(code);
            }}
          >
            <input value={code} placeholder="ABC234" aria-label="Código da mesa" onChange={(e) => setCode(e.target.value)} />
            <button type="submit" disabled={busy}>
              Entrar
            </button>
          </form>
          <h2>Mesas agora</h2>
          <ul className="salas">
            {rooms === null && <li className="vazia">Procurando mesas…</li>}
            {rooms === 'erro' && <li className="vazia">Não deu para ver as mesas agora; o código continua valendo.</li>}
            {Array.isArray(rooms) && rooms.length === 0 && <li className="vazia">Nenhuma mesa agora. Crie a sua e chame alguém!</li>}
            {Array.isArray(rooms) &&
              rooms.map((r, i) => {
                const full = r.players >= r.seats;
                return (
                  <li key={r.code ?? `privada-${i}`}>
                    <span>
                      {r.code ? <code>{r.code}</code> : 'Mesa privada'} · {r.players}/{r.seats}
                      {r.bots > 0 && ` · ${r.bots} ${r.bots === 1 ? 'computador' : 'computadores'}`} · {r.goal} tentos{r.flor ? '' : ', sem Flor'} · {r.playing ? 'jogando' : 'esperando'}
                      {r.names.length > 0 && <small>{r.names.join(', ')}</small>}
                    </span>
                    {r.code && (
                      <button type="button" disabled={busy || full} onClick={() => join(r.code!)}>
                        {full ? 'Cheia' : 'Entrar'}
                      </button>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      </div>
      <p className="status" role="status">
        {status}
      </p>
    </main>
  );
}
