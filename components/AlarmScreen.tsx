"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRealtime } from "inngest/react";
import { alarmChannel, ALARM_TOPICS } from "@/inngest/channels";
import { getRealtimeToken, sendAlarmAction, startAlarm } from "@/app/actions";
import {
  ACCENTS,
  CONSEQUENCES,
  MAX_LEVEL,
  type AlarmMessage,
  type ConsequenceMessage,
  type EmailMessage,
} from "@/lib/alarm";
import { useAlarmSound } from "./useAlarmSound";

type Settings = {
  delay: number;
  ringTimeout: number;
  gap: number;
  idleTime: string;
  ringTime: string;
  snoozeMin: number;
  sound: boolean;
  showLog: boolean;
};

const DEFAULTS: Settings = {
  delay: 8,
  ringTimeout: 20,
  gap: 4,
  idleTime: "5:59",
  ringTime: "6:00",
  snoozeMin: 9,
  sound: true,
  showLog: false,
};

const STORAGE_KEY = "angry-alarm-settings";

function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return DEFAULTS;
  }
}

type Phase = "idle" | "armed" | AlarmMessage["status"];

export default function AlarmScreen() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [panelOpen, setPanelOpen] = useState(false);
  const [ignored, setIgnored] = useState<string[]>([]);
  // Between pressing Space and the run publishing "armed". Holds the alarmId that was current at the time.
  const [arming, setArming] = useState<{ baseline: string | null } | null>(null);
  const [localLog, setLocalLog] = useState<string[]>([]);
  const sentFor = useRef<string | null>(null);

  const update = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setSettings((s) => {
      const next = { ...s, [k]: v };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });

  const { messages, connectionStatus, reset: resetRealtime } = useRealtime({
    channel: alarmChannel,
    topics: ALARM_TOPICS,
    token: getRealtimeToken,
    historyLimit: 400,
    autoCloseOnTerminal: false,
    pauseOnHidden: false,
  });

  const view = useMemo(() => {
    // Follow the most recently armed alarm; fall back to the latest one if we joined mid-run.
    let armedId: string | undefined;
    let latestId: string | undefined;
    for (const m of messages.all) {
      if (m.kind !== "data" || m.topic !== "alarm") continue;
      const a = m.data as AlarmMessage;
      latestId = a.alarmId;
      if (a.status === "armed") armedId = a.alarmId;
    }
    const id = armedId ?? latestId;
    if (!id || ignored.includes(id)) return null;
    let alarm: AlarmMessage | undefined;
    for (const m of messages.all) {
      if (m.kind === "data" && m.topic === "alarm" && (m.data as AlarmMessage).alarmId === id) {
        alarm = m.data as AlarmMessage;
      }
    }
    if (!alarm) return null;

    let email: EmailMessage | undefined;
    const consequences: Partial<Record<ConsequenceMessage["name"], ConsequenceMessage>> = {};
    const log: string[] = [];
    for (const m of messages.all) {
      if (m.kind !== "data") continue;
      const d = m.data as { alarmId?: string };
      if (d.alarmId !== id) continue;
      if (m.topic === "alarm") log.push(...logLines(m.data as AlarmMessage));
      if (m.topic === "email") {
        email = m.data as EmailMessage;
        log.push('step.run("draft-apology-email")', `step.run("send-apology-email-to-team") · ${email.mode}`);
      }
      if (m.topic === "consequence") {
        const c = m.data as ConsequenceMessage;
        if (!Object.keys(consequences).length) log.push(`step.sendEvent("fan-out", ${CONSEQUENCES.length} events)`);
        consequences[c.name] = c;
        if (c.status === "done") log.push(`consequence/${c.name} done · ${c.mode}`);
      }
    }
    return { alarm, email, consequences, log };
  }, [messages.all, ignored]);

  const currentId = view?.alarm.alarmId ?? null;
  const isArming = arming !== null && arming.baseline === currentId;
  const phase: Phase = isArming ? "armed" : (view?.alarm.status ?? "idle");
  const level = view && phase !== "armed" ? view.alarm.level : 0;
  const ringing = phase === "ringing";

  const unlockAudio = useAlarmSound(ringing, level, settings.sound);

  const reset = useCallback(() => {
    if (currentId) setIgnored((ids) => [...ids, currentId]);
    setArming(null);
    setLocalLog([]);
    sentFor.current = null;
    resetRealtime();
  }, [currentId, resetRealtime]);

  const arm = useCallback(() => {
    unlockAudio();
    if (phase === "armed" || phase === "ringing" || phase === "snoozed") return;
    if (phase === "dismissed" || phase === "gave-up") reset();
    setArming({ baseline: phase === "idle" ? currentId : null });
    setLocalLog(['inngest.send("alarm/start")']);
    startAlarm({
      startDelaySeconds: settings.delay,
      ringTimeout: settings.ringTimeout,
      snoozeDuration: settings.gap,
      firstRing: settings.ringTime,
      snoozeMinutes: settings.snoozeMin,
    }).catch((err: unknown) => {
      setArming(null);
      setLocalLog((l) => [...l, `alarm/start failed: ${String(err)}`]);
    });
  }, [unlockAudio, phase, currentId, reset, settings]);

  const act = useCallback(
    (action: "snooze" | "dismiss") => {
      unlockAudio();
      if (!view || phase !== "ringing") return;
      const key = `${view.alarm.alarmId}:${view.alarm.level}`;
      if (sentFor.current === key) return;
      sentFor.current = key;
      sendAlarmAction(view.alarm.alarmId, action).catch(() => {
        sentFor.current = null;
      });
    },
    [unlockAudio, view, phase],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "ringing") act("snooze");
        else arm();
      } else if (k === "enter" || k === "d") {
        e.preventDefault();
        act("dismiss");
      } else if (k === "r") reset();
      else if (k === "h") setPanelOpen((o) => !o);
      else if (k === "l") update("showLog", !settings.showLog);
      else if (k === "f") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const accent = ACCENTS[Math.min(level, MAX_LEVEL)];
  const vars = {
    "--acc": accent,
    "--amp": `${1 + level * 1.6}px`,
    "--sp": `${Math.max(0.08, 0.5 - level * 0.08)}s`,
  } as CSSProperties;

  const clock = phase === "idle" || phase === "armed" ? settings.idleTime : view!.alarm.displayTime;
  const sub = {
    idle: `Alarm ${settings.ringTime} AM`,
    armed: `Alarm ${settings.ringTime} AM`,
    ringing: level ? `Snooze ${level}` : "Alarm",
    snoozed: "Snoozed",
    dismissed: "Alarm stopped",
    "gave-up": "Alarm gave up",
  }[phase];
  const msg =
    phase === "ringing" || phase === "gave-up"
      ? view!.alarm.message
      : phase === "dismissed"
        ? level
          ? `Fine. Good morning. (${level} snooze${level > 1 ? "s" : ""})`
          : "Good morning."
        : "";

  const showEmail = !!view?.email && (phase === "ringing" || phase === "snoozed") && level < MAX_LEVEL;
  const showFan = level >= MAX_LEVEL && (phase === "ringing" || phase === "gave-up" || phase === "snoozed");
  const logLinesShown = [...localLog, ...(view?.log ?? [])].slice(-7);
  const dateLabel = useMemo(
    () => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    [],
  );

  return (
    <div className="alarm" style={vars}>
      <div
        id="armed"
        title={`realtime: ${connectionStatus}`}
        className={phase === "armed" ? "on" : connectionStatus === "error" ? "err" : ""}
      />
      <div
        id="stage"
        className={ringing ? "ring shake" : ""}
        onClick={() => {
          unlockAudio();
          if (phase === "idle") arm();
        }}
      >
        <div className="date">{dateLabel}</div>
        <div className="clock">{clock}</div>
        <div className="sub">{sub}</div>
        <div className={`lvl ${level > 0 && phase !== "idle" && phase !== "armed" ? "" : "hide"}`}>
          {Array.from({ length: MAX_LEVEL }, (_, i) => (
            <i key={i} className={i < level ? "on" : ""} />
          ))}
        </div>
        <div className="msg">{msg}</div>
        {view?.email && <EmailCard text={view.email.text} hidden={!showEmail} />}
        {showFan && (
          <div className="card">
            <h3>step.sendEvent: fanning out</h3>
            <div className="fan">
              {CONSEQUENCES.map((c) => {
                const done = view?.consequences[c.name]?.status === "done";
                return (
                  <div key={c.name} className={done ? "done" : ""}>
                    <b>{c.label}</b>
                    <span>{done ? c.doneWord : "sending"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className={`btns ${ringing ? "" : "hide"}`}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              act("snooze");
            }}
          >
            Snooze
          </button>
          <button
            className="ghost"
            onClick={(e) => {
              e.stopPropagation();
              act("dismiss");
            }}
          >
            Stop
          </button>
        </div>
      </div>

      <div id="log" className={settings.showLog ? "" : "hide"}>
        {logLinesShown.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>

      {panelOpen && (
        <div id="panel" onClick={(e) => e.stopPropagation()}>
          <h2>Filming controls</h2>
          <NumberField label="Delay after Space (sec)" value={settings.delay} min={0} max={120} onChange={(v) => update("delay", v)} />
          <NumberField label="Ring timeout (sec)" value={settings.ringTimeout} min={1} max={600} onChange={(v) => update("ringTimeout", v)} />
          <NumberField label="Snooze length (sec)" value={settings.gap} min={1} max={600} onChange={(v) => update("gap", v)} />
          <TextField label="Idle clock shows" value={settings.idleTime} onChange={(v) => update("idleTime", v)} />
          <TextField label="First ring shows" value={settings.ringTime} onChange={(v) => update("ringTime", v)} />
          <NumberField label="Each snooze adds (min)" value={settings.snoozeMin} min={1} max={60} onChange={(v) => update("snoozeMin", v)} />
          <label>
            Sound
            <input type="checkbox" checked={settings.sound} onChange={(e) => update("sound", e.target.checked)} />
          </label>
          <label>
            Show step log
            <input type="checkbox" checked={settings.showLog} onChange={(e) => update("showLog", e.target.checked)} />
          </label>
          <div className="keys">
            <kbd>Space</kbd> arm, then snooze while ringing
            <br />
            <kbd>Enter</kbd> or <kbd>D</kbd> stop alarm
            <br />
            <kbd>R</kbd> reset · <kbd>F</kbd> fullscreen · <kbd>L</kbd> log · <kbd>H</kbd> this panel
            <br />
            On a phone: tap the screen to arm
            <br />
            Realtime: {connectionStatus}
          </div>
        </div>
      )}
    </div>
  );
}

function logLines(a: AlarmMessage): string[] {
  switch (a.status) {
    case "armed":
      return [
        a.trigger === "cron" ? 'cron "TZ=Australia/Brisbane 0 6 * * *" triggered' : 'event "alarm/start" received',
        ...(a.startDelay && a.startDelay !== "0s" ? [`step.sleep("get-in-position", "${a.startDelay}")`] : []),
      ];
    case "ringing":
      return [
        `step.realtime.publish("ring-level-${a.level}")`,
        `step.waitForEvent("wait-for-response-${a.level}", { timeout: "${a.ringTimeout}" })`,
      ];
    case "snoozed":
      return [
        a.reason === "timeout" ? "wait timed out: counts as a snooze" : 'event "alarm/action" snooze received',
        `step.sleep("snooze-${a.level + 1}", "${a.snoozeDuration}")`,
      ];
    case "dismissed":
      return ['event "alarm/action" dismiss received', "function completed"];
    case "gave-up":
      return ["no more levels. function completed"];
  }
}

// Stays mounted (just hidden) so the typing never restarts mid-run.
function EmailCard({ text, hidden }: { text: string; hidden: boolean }) {
  const [typed, setTyped] = useState({ text: "", n: 0 });
  const n = typed.text === text ? typed.n : 0;

  useEffect(() => {
    const t = setInterval(() => {
      setTyped((s) => {
        const cur = s.text === text ? s.n : 0;
        if (cur >= text.length) {
          clearInterval(t);
          return s;
        }
        return { text, n: cur + 1 };
      });
    }, 22);
    return () => clearInterval(t);
  }, [text]);

  return (
    <div className={`card ${hidden ? "hide" : ""}`}>
      <h3>step.run: drafting apology to your team</h3>
      <pre>{text.slice(0, n)}</pre>
    </div>
  );
}

function NumberField(props: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label>
      {props.label}
      <input
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => props.onChange(Math.max(props.min, Math.min(props.max, Number(e.target.value) || 0)))}
      />
    </label>
  );
}

function TextField(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label>
      {props.label}
      <input type="text" value={props.value} onChange={(e) => props.onChange(e.target.value)} />
    </label>
  );
}
