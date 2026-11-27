import { inngest } from "../client";
import { alarmChannel } from "../channels";
import { resolveSettings, type AlarmOverrides } from "../config";
import { APOLOGY_EMAIL, CONSEQUENCES, LEVEL_MESSAGES, MAX_LEVEL, displayTime } from "@/lib/alarm";
import { sendEmail } from "@/lib/integrations";

export const angryAlarm = inngest.createFunction(
  {
    id: "angry-alarm",
    name: "Angry Alarm",
    triggers: [{ cron: "TZ=Australia/Brisbane 0 6 * * *" }, { event: "alarm/start" }],
  },
  async ({ event, step }) => {
    const fromEvent = event?.name === "alarm/start";
    const s = resolveSettings(fromEvent ? (event.data as AlarmOverrides) : {});
    const alarmId = await step.run("generate-alarm-id", () => crypto.randomUUID());
    const base = { alarmId, trigger: fromEvent ? ("event" as const) : ("cron" as const) };
    const timeAt = (level: number) => displayTime(s.firstRing, level, s.snoozeMinutes);

    await step.realtime.publish("arm-alarm", alarmChannel.alarm, {
      ...base,
      level: 0,
      status: "armed",
      message: "",
      displayTime: timeAt(0),
      startDelay: `${s.startDelaySeconds}s`,
    });

    if (s.startDelaySeconds > 0) {
      await step.sleep("get-in-position", `${s.startDelaySeconds}s`);
    }

    for (let level = 0; level <= MAX_LEVEL; level++) {
      const ring = {
        ...base,
        level,
        message: LEVEL_MESSAGES[level],
        displayTime: timeAt(level),
        ringTimeout: s.ringTimeout,
        snoozeDuration: s.snoozeDuration,
      };
      await step.realtime.publish(`ring-level-${level}`, alarmChannel.alarm, { ...ring, status: "ringing" });

      if (level === 3) {
        const text = await step.run("draft-apology-email", () => APOLOGY_EMAIL);
        const sent = await step.run("send-apology-email-to-team", () =>
          sendEmail(process.env.TEAM_EMAIL, "Bailey will be late to standup", text),
        );
        await step.realtime.publish("show-apology-email", alarmChannel.email, { alarmId, text, mode: sent.mode });
      }

      if (level === MAX_LEVEL) {
        await step.sendEvent(
          "fan-out",
          CONSEQUENCES.map((c) => ({ name: `consequence/${c.name}`, data: { alarmId } })),
        );
      }

      const response = await step.waitForEvent(`wait-for-response-${level}`, {
        event: "alarm/action",
        match: "data.alarmId",
        timeout: s.ringTimeout,
      });

      if (response?.data?.action === "dismiss") {
        await step.realtime.publish("alarm-dismissed", alarmChannel.alarm, {
          ...ring,
          status: "dismissed",
          reason: "dismiss",
        });
        return { alarmId, outcome: "dismissed", snoozes: level };
      }

      const reason = response ? "snooze" : "timeout";
      if (level === MAX_LEVEL) {
        await step.realtime.publish("alarm-gave-up", alarmChannel.alarm, { ...ring, status: "gave-up", reason });
        return { alarmId, outcome: "gave-up", snoozes: level + 1 };
      }

      await step.realtime.publish(`snoozed-${level}`, alarmChannel.alarm, { ...ring, status: "snoozed", reason });
      await step.sleep(`snooze-${level + 1}`, s.snoozeDuration);
    }
  },
);
