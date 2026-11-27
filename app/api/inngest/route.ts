import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { angryAlarm } from "@/inngest/functions/angry-alarm";
import { consequenceFunctions } from "@/inngest/functions/consequences";

export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [angryAlarm, ...consequenceFunctions],
});
