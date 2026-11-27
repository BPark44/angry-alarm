"use server";

import { getClientSubscriptionToken } from "inngest/react";
import { inngest } from "@/inngest/client";
import { alarmChannel, ALARM_TOPICS } from "@/inngest/channels";
import type { AlarmOverrides } from "@/inngest/config";

export async function startAlarm(overrides: AlarmOverrides) {
  await inngest.send({ name: "alarm/start", data: overrides });
}

export async function sendAlarmAction(alarmId: string, action: "snooze" | "dismiss") {
  await inngest.send({ name: "alarm/action", data: { alarmId, action } });
}

export async function getRealtimeToken() {
  return getClientSubscriptionToken(inngest, { channel: alarmChannel, topics: [...ALARM_TOPICS] });
}
