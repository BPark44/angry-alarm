import { inngest } from "../client";
import { alarmChannel } from "../channels";
import { CONSEQUENCES, type ConsequenceName } from "@/lib/alarm";
import { postSlack, postToX, renameStandup, sendEmail, sendSms, type SendResult } from "@/lib/integrations";

const ACTIONS: Record<ConsequenceName, { step: string; run: () => Promise<SendResult> }> = {
  "text-mum": {
    step: "text-mum",
    run: () => sendSms("Hi Mum, it's Bailey's alarm clock. He has snoozed five times. Please call him."),
  },
  "post-x": {
    step: "post-on-x",
    run: () => postToX("I have snoozed my alarm five times this morning. My alarm made me post this."),
  },
  "slack-general": {
    step: "post-in-slack-general",
    run: () => postSlack(":rotating_light: Bailey has snoozed 5 times. Standup is at risk. — his alarm clock"),
  },
  "email-manager": {
    step: "email-manager",
    run: () =>
      sendEmail(
        process.env.MANAGER_EMAIL,
        "Regarding Bailey's attendance this morning",
        "Hi,\n\nThis is Bailey's alarm clock. He snoozed five times. I have done everything I can.\n\nRegards,\nThe Alarm",
      ),
  },
  "rename-standup": {
    step: "rename-standup-to-bailey-overslept",
    run: () => renameStandup("Bailey overslept"),
  },
};

export const consequenceFunctions = CONSEQUENCES.map((c, i) =>
  inngest.createFunction(
    { id: `consequence-${c.name}`, name: `Consequence: ${c.label}`, retries: 1, triggers: [{ event: `consequence/${c.name}` }] },
    async ({ event, step }) => {
      const alarmId = String(event.data?.alarmId ?? "");
      await step.realtime.publish("tell-ui-sending", alarmChannel.consequence, { alarmId, name: c.name, status: "sending" });
      // Stagger so the UI list ticks off one by one.
      await step.sleep("dramatic-pause", `${600 + i * 500}ms`);
      const result = await step.run(ACTIONS[c.name].step, ACTIONS[c.name].run);
      await step.realtime.publish("tell-ui-done", alarmChannel.consequence, {
        alarmId,
        name: c.name,
        status: "done",
        mode: result.mode,
      });
      return result;
    },
  ),
);
