// Shared between the workflow and the UI. No env access here.

export type AlarmStatus = "armed" | "ringing" | "snoozed" | "dismissed" | "gave-up";

export type AlarmMessage = {
  alarmId: string;
  level: number;
  status: AlarmStatus;
  message: string;
  displayTime: string;
  trigger?: "cron" | "event";
  startDelay?: string;
  ringTimeout?: string;
  snoozeDuration?: string;
  reason?: "snooze" | "timeout" | "dismiss";
};

export type EmailMessage = { alarmId: string; text: string; mode: "real" | "mock" };

export type ConsequenceMessage = {
  alarmId: string;
  name: ConsequenceName;
  status: "sending" | "done";
  mode?: "real" | "mock";
};

export const MAX_LEVEL = 5;

export const LEVEL_MESSAGES = [
  "Rise and shine.",
  "This is your second warning.",
  "I've seen your calendar. You have a standup.",
  "I've told your team you'll be late.",
  "I am no longer asking.",
  "You did this.",
] as const;

export const ACCENTS = ["#b8f5d0", "#d9f59a", "#ffd166", "#ff9f43", "#ff5e3a", "#ff2d2d"] as const;

export const APOLOGY_EMAIL = `Hi team,

Bailey will be late to standup. He was given five chances. He chose the snooze button every time. Please hold his tickets in your thoughts.

Sent automatically by his alarm clock`;

export const CONSEQUENCES = [
  { name: "text-mum", label: "Texting Mum", doneWord: "sent" },
  { name: "post-x", label: "Posting on X", doneWord: "posted" },
  { name: "slack-general", label: "Slack #general", doneWord: "sent" },
  { name: "email-manager", label: "Emailing your manager", doneWord: "delivered" },
  { name: "rename-standup", label: "Calendar: renamed standup to 'Bailey overslept'", doneWord: "done" },
] as const;

export type ConsequenceName = (typeof CONSEQUENCES)[number]["name"];

/** "6:00" + level * snoozeMinutes, as a 12h clock string. */
export function displayTime(firstRing: string, level: number, snoozeMinutes: number): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(firstRing.trim());
  if (!m) return firstRing;
  let t = Number(m[1]) * 60 + Number(m[2]) + level * Math.max(0, snoozeMinutes || 0);
  t = ((t % 1440) + 1440) % 1440;
  const h = Math.floor(t / 60) % 12 || 12;
  return `${h}:${String(t % 60).padStart(2, "0")}`;
}
