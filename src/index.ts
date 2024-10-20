import { Hono, type HonoRequest } from "hono";
import crypto from "crypto";

const app = new Hono();
const TELEGRAM_TOKEN = "your-bot-token-here";
const CHAT_ID = "chat-id-here";
const GITHUB_SECRET = "your-secret-token-here";

// Helper to send message on Telegram
const sendMessage = async (text: string) => {
  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${CHAT_ID}&text=${encodeURIComponent(text)}&parse_mode=HTML`,
  ).catch(() => {
    console.error("Unable to send Telegram message");
  });
};

// Verify GitHub webhook signature
const verifySignature = async (req: HonoRequest) => {
  const signature = req.header("x-hub-signature-256") || "";
  const payload = await req.text();
  const computedSignature =
    "sha256=" +
    crypto.createHmac("sha256", GITHUB_SECRET).update(payload).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(computedSignature),
  );
};

app.get("/", (c) => c.text("Hello Hono!"));

app.post("/webhook", async (c) => {
  if (!(await verifySignature(c.req))) {
    console.error("Invalid signature");
    return c.text("Unauthorized", 401);
  }

  const event = c.req.header("x-github-event");
  const payload = await c.req.json();

  if (!event) {
    console.log("Missing event header");
    return c.text("Bad Request", 400);
  }

  if (event === "pull_request") return handlePullRequest(payload);
  if (event === "status") return handleStatus(payload);
  if (event === "repository") return handleRepository(payload);

  console.log(`Unhandled event: ${event}`);
  return c.text("Webhook received", 200);
});

const handlePullRequest = async (payload: any) => {
  const { action, pull_request } = payload;
  const { title, html_url: url, merged } = pull_request;

  if (action === "closed" && merged) {
    await sendMessage(`✅ PR merged: ${title}\n${url}`);
  } else {
    await sendMessage(`🆕 PR ${action}: ${title}\n${url}`);
  }
};

const handleStatus = async (payload: any) => {
  if (payload.state !== "failure") return;

  const { full_name: repo } = payload.repository;
  const { html_url: commitUrl } = payload.commit;
  await sendMessage(`❌ Build failed in ${repo}\nCommit: ${commitUrl}`);
};

const handleRepository = async (payload: any) => {
  const { action, repository } = payload;
  const { full_name: repoName, html_url: repoUrl } = repository;

  if (action === "created") {
    await sendMessage(`📦 New repository created: ${repoName}\n${repoUrl}`);
  } else if (action === "deleted") {
    await sendMessage(`🗑️ Repository deleted: ${repoName}`);
  } else {
    console.log(`Unhandled repository action: ${action}`);
  }
};

export default app;
