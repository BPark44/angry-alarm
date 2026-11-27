import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "angry-alarm",
  // Vercel hobby functions cap at 60s; go async well before that.
  checkpointing: { maxRuntime: "40s" },
});
