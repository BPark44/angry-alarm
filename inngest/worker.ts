// Runs the functions locally but connected to Inngest Cloud (no tunnel). Used by `bun run dev:cloud`.
import { connect } from "inngest/connect";
import { inngest } from "./client";
import { angryAlarm } from "./functions/angry-alarm";
import { consequenceFunctions } from "./functions/consequences";

const connection = await connect({
  apps: [{ client: inngest, functions: [angryAlarm, ...consequenceFunctions] }],
});
console.log(`Connected to Inngest Cloud (${connection.state}). Runs show at app.inngest.com.`);
