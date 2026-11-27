export type AlarmOverrides = {
  startDelaySeconds?: number;
  /** Duration string ("20s", "2m") or seconds. */
  ringTimeout?: string | number;
  snoozeDuration?: string | number;
  firstRing?: string;
  snoozeMinutes?: number;
};

const PRESETS = {
  filming: { startDelaySeconds: 8, ringTimeout: "20s", snoozeDuration: "4s" },
  real: { startDelaySeconds: 0, ringTimeout: "2m", snoozeDuration: "9m" },
} as const;

const asDuration = (v: string | number | undefined, fallback: string) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? `${v}s` : typeof v === "string" && v ? v : fallback;

export function resolveSettings(overrides: AlarmOverrides = {}) {
  // Unset defaults to real so the 6am cron behaves like an actual alarm.
  const mode = process.env.ALARM_MODE === "filming" ? "filming" : "real";
  const preset = PRESETS[mode];
  const delay = Number(overrides.startDelaySeconds ?? preset.startDelaySeconds);
  return {
    mode,
    startDelaySeconds: Number.isFinite(delay) && delay > 0 ? Math.min(delay, 600) : 0,
    ringTimeout: asDuration(overrides.ringTimeout, preset.ringTimeout),
    snoozeDuration: asDuration(overrides.snoozeDuration, preset.snoozeDuration),
    firstRing: overrides.firstRing || "6:00",
    snoozeMinutes: Number(overrides.snoozeMinutes ?? 9) || 9,
  };
}
