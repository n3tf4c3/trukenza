import type { CharacterId } from '@trukenza/shared';
import { useStore } from './store';
import { SPOKEN, callVoiceStyle } from './performance';
import { portugueseVoices, SpeechQueue } from './speechQueue';
import { playVoiceClip, prepareVoiceClips } from './sound';

const synth = typeof window.speechSynthesis === 'undefined' ? null : window.speechSynthesis;
let available: SpeechSynthesisVoice[] = [];
let unlocked = false;
let utterance: SpeechSynthesisUtterance | null = null;
let stopClip: (() => void) | undefined;
let startupTimer: ReturnType<typeof setTimeout> | undefined;
let ticket = 0;
let failedVoice = '';

function cancelPlayback(): void {
  ticket++;
  clearTimeout(startupTimer);
  if (utterance) {
    utterance.onend = utterance.onerror = utterance.onstart = null;
    synth?.cancel();
    utterance = null;
  }
  stopClip?.();
  stopClip = undefined;
}

const queue = new SpeechQueue({
  speak(line, started, ended) {
    const token = ++ticket;
    const state = useStore.getState();
    const voice = available.find(v => v.voiceURI === state.voiceId && v.voiceURI !== failedVoice);
    let didStart = false;
    let local = false;
    const playLocal = () => {
      if (token !== ticket || local) return;
      local = true;
      clearTimeout(startupTimer);
      if (utterance) {
        utterance.onend = utterance.onerror = utterance.onstart = null;
        synth?.cancel();
        utterance = null;
      }
      if (state.voiceId) failedVoice = state.voiceId;
      useStore.setState({ voiceFallback: state.voiceId !== '' });
      if (!line.clip) { ended(true); return; }
      const rate = Math.max(0.88, Math.min(1.16, line.rate * 0.6 + line.pitch * 0.4));
      stopClip = playVoiceClip(line.clip, rate, state.voiceVolume, started, ended);
    };
    if (!synth || !voice) { playLocal(); return; }
    useStore.setState({ voiceFallback: false });
    const u = new SpeechSynthesisUtterance(line.text);
    utterance = u;
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = line.rate;
    u.pitch = line.pitch;
    u.volume = state.volume * state.voiceVolume;
    u.onstart = () => {
      if (token !== ticket || local) return;
      didStart = true;
      clearTimeout(startupTimer);
      started();
    };
    u.onend = () => {
      if (token !== ticket || local) return;
      if (!didStart) { playLocal(); return; }
      utterance = null;
      ended();
    };
    u.onerror = () => {
      if (token !== ticket || local) return;
      if (!didStart) { playLocal(); return; }
      utterance = null;
      ended(true);
    };
    // Não espera a rede: se a voz não iniciar logo, assume a amostra já carregada.
    startupTimer = setTimeout(playLocal, 300);
    try { synth.speak(u); } catch { playLocal(); }
  },
  cancel: cancelPlayback,
}, (line, failed) => {
  useStore.setState({
    speaking: line ? { seat: line.seat, text: line.text, at: performance.now() } : null,
    ...(failed ? { voiceStatus: 'error' as const } : line ? { voiceStatus: 'ready' as const } : {}),
  });
});

function refreshVoices(): void {
  available = portugueseVoices(synth?.getVoices() ?? []);
  useStore.setState({
    voices: available.map(v => ({ id: v.voiceURI, name: v.name })),
    ...(useStore.getState().voiceStatus === 'loading' ? { voiceStatus: 'ready' as const } : {}),
  });
}
function unlock(): void { unlocked = true; }
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
window.addEventListener('click', unlock, true);
synth?.addEventListener('voiceschanged', refreshVoices);
refreshVoices();

/** Só frases fixas do jogo: nunca envia nomes, chat ou cartas a um serviço de voz. */
export function speakCall(call: string, character: CharacterId, seat: number): void {
  const s = useStore.getState();
  const text = SPOKEN[call];
  if (!text || !unlocked || !s.table || document.hidden || s.reconnecting ||
      !s.voiceOn || !s.soundOn || s.volume <= 0 || s.voiceVolume <= 0) return;
  if (call === 'previa') failedVoice = '';
  queue.enqueue({ text, clip: call, seat, ...callVoiceStyle(call, character), at: performance.now() });
}
export function stopVoices(): void { queue.cancel(); }

const unsubscribe = useStore.subscribe((s, previous) => {
  if (s.table?.code !== previous.table?.code || s.reconnecting !== previous.reconnecting ||
      s.voiceOn !== previous.voiceOn || s.soundOn !== previous.soundOn ||
      s.volume !== previous.volume || s.voiceVolume !== previous.voiceVolume || s.voiceId !== previous.voiceId) stopVoices();
  if (s.voiceId !== previous.voiceId) failedVoice = '';
  if (s.table && s.table.code !== previous.table?.code) prepareVoiceClips(Object.keys(SPOKEN));
});
function visibility(): void { if (document.hidden) stopVoices(); }
document.addEventListener('visibilitychange', visibility);
window.addEventListener('pagehide', stopVoices);
if (useStore.getState().table) prepareVoiceClips(Object.keys(SPOKEN));

if (import.meta.hot) import.meta.hot.dispose(() => {
  unsubscribe();
  stopVoices();
  synth?.removeEventListener('voiceschanged', refreshVoices);
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
  window.removeEventListener('click', unlock, true);
  window.removeEventListener('pagehide', stopVoices);
  document.removeEventListener('visibilitychange', visibility);
});
