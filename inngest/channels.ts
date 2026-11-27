import { channel, staticSchema } from "inngest/realtime";
import type { AlarmMessage, ConsequenceMessage, EmailMessage } from "@/lib/alarm";

// One global channel: cron runs start without the UI knowing the alarmId.
export const alarmChannel = channel({
  name: "angry-alarm",
  topics: {
    alarm: { schema: staticSchema<AlarmMessage>() },
    email: { schema: staticSchema<EmailMessage>() },
    consequence: { schema: staticSchema<ConsequenceMessage>() },
  },
});

export const ALARM_TOPICS = ["alarm", "email", "consequence"] as const;
