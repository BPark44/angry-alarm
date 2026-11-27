"use server";

import { getClientSubscriptionToken } from "inngest/react";
import { inngest } from "@/inngest/client";
import { alarmChannel, ALARM_TOPICS } from "@/inngest/channels";
import type { AlarmOverrides } from "@/inngest/config";

type Result = { ok: true } | { ok: false; error: string };

// Return errors instead of throwing: production hides thrown server action messages.
async function attempt(fn: () => Promise<unknown>): Promise<Result> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    console.error(err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function startAlarm(overrides: AlarmOverrides) {
  return attempt(() => inngest.send({ name: "alarm/start", data: overrides }));
}

export async function sendAlarmAction(alarmId: string, action: "snooze" | "dismiss") {
  return attempt(() => inngest.send({ name: "alarm/action", data: { alarmId, action } }));
}

export async function getRealtimeToken() {
  return getClientSubscriptionToken(inngest, { channel: alarmChannel, topics: [...ALARM_TOPICS] });
}
