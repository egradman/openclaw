import type { SlackNotifyConfig } from "../../config/types.slack.js";
import type { SlackMessageEvent } from "../types.js";
import type { SlackMonitorContext } from "./context.js";
import { logVerbose } from "../../globals.js";
import { fetchWithTimeout } from "../../utils/fetch-timeout.js";

const NOTIFY_TIMEOUT_MS = 5_000;

/**
 * Fire-and-forget push notification to the configured notify endpoint.
 * Best-effort — failures are logged and swallowed.
 */
export async function notifyPush(params: {
  ctx: SlackMonitorContext;
  message: SlackMessageEvent;
  notify: SlackNotifyConfig;
}): Promise<void> {
  const { ctx, message, notify } = params;
  const { endpoint, secret } = notify;
  if (!endpoint || !secret) {
    return;
  }

  const channelInfo = await ctx.resolveChannelName(message.channel);
  const channelName = channelInfo?.name;
  if (!channelName) {
    return;
  }

  // For threaded messages use the parent thread_ts; for top-level use own ts
  const threadTs = message.thread_ts ?? message.ts;
  if (!threadTs) {
    return;
  }

  const sender = message.user ? await ctx.resolveUserName(message.user) : null;

  const body: Record<string, string | undefined> = {
    team_id: ctx.teamId,
    channel: channelName,
    thread_ts: threadTs,
    user_id: message.user,
    user_name: sender?.name ?? message.username,
    text: message.text,
  };

  try {
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Notify-Secret": secret,
        },
        body: JSON.stringify(body),
      },
      NOTIFY_TIMEOUT_MS,
    );
    logVerbose(`slack notify: ${res.status} for #${channelName} thread=${threadTs}`);
  } catch (err) {
    logVerbose(`slack notify failed: ${String(err)}`);
  }
}
