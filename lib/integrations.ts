// Each integration sends for real only when all its env vars are set; otherwise it logs and mocks.

export type SendResult = { mode: "real" | "mock"; detail: string };

const mock = (what: string, payload: unknown): SendResult => {
  console.log(`[mock] ${what}`, payload);
  return { mode: "mock", detail: `${what} (mocked: env vars not set)` };
};

async function check(res: Response, what: string) {
  if (!res.ok) throw new Error(`${what} failed: ${res.status} ${await res.text()}`);
}

export async function sendEmail(to: string | undefined, subject: string, text: string): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from || !to) return mock(`email "${subject}"`, { to, text });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  await check(res, "Resend");
  const { id } = (await res.json()) as { id?: string };
  return { mode: "real", detail: `Resend email ${id ?? ""} to ${to}` };
}

export async function postSlack(text: string): Promise<SendResult> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return mock("Slack #general", { text });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  await check(res, "Slack webhook");
  return { mode: "real", detail: "Posted to Slack webhook" };
}

export async function sendSms(body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.MUM_PHONE;
  if (!sid || !token || !from || !to) return mock("SMS to Mum", { body });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  await check(res, "Twilio");
  const { sid: messageSid } = (await res.json()) as { sid?: string };
  return { mode: "real", detail: `Twilio SMS ${messageSid ?? ""}` };
}

export async function postToX(text: string): Promise<SendResult> {
  // TODO: real X API post (needs OAuth 1.0a user context). Mock only for now.
  return mock("X post", { text });
}

export async function renameStandup(newTitle: string): Promise<SendResult> {
  // TODO: Google Calendar events.patch on today's standup. Mock only for now.
  return mock("rename standup", { newTitle });
}
