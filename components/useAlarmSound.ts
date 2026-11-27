import { useCallback, useEffect, useRef } from "react";

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

/** Web Audio beeps that get faster and harsher per level. */
export function useAlarmSound(active: boolean, level: number, enabled: boolean) {
  const ctx = useRef<AudioContext | null>(null);

  // Browsers only allow audio after a gesture, so call this from key/tap handlers.
  const unlock = useCallback(() => {
    if (!ctx.current) {
      const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
      if (Ctor) ctx.current = new Ctor();
    }
    if (ctx.current?.state === "suspended") ctx.current.resume().catch(() => {});
  }, []);

  useEffect(() => {
    if (!active || !enabled) return;
    const a = ctx.current;
    if (!a) return;

    const tone = (f: number, d: number, type: OscillatorType, vol: number) => {
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.setValueAtTime(vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d);
      o.connect(g).connect(a.destination);
      o.start();
      o.stop(a.currentTime + d);
    };

    const period = Math.max(140, 520 - level * 80);
    const base = 880 + level * 120;
    const type: OscillatorType = level >= 3 ? "sawtooth" : "square";
    const vol = Math.min(0.35, 0.12 + level * 0.05);
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    const tick = () => {
      tone(base, 0.12, type, vol);
      timeouts.push(setTimeout(() => tone(base * (level >= 4 ? 1.5 : 1), 0.12, type, vol), period / 2.4));
    };
    tick();
    const interval = setInterval(tick, period);
    return () => {
      clearInterval(interval);
      timeouts.forEach(clearTimeout);
    };
  }, [active, level, enabled]);

  return unlock;
}
