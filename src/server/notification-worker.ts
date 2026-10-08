import "server-only";
import webpush from "web-push";
import type { State } from "@/lib/types";
import { localMode } from "./config";
import { databaseClient } from "./supabase";
import {
  generateDeadlineNotifications,
  notificationVisible,
  pushEndpointAllowed,
} from "./notifications";

async function update<T>(work: (s: State) => T): Promise<T> {
  if (localMode()) return (await import("./store")).transaction(work);
  const db = databaseClient();
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, error } = await db
      .from("portal_state")
      .select("revision,value")
      .eq("id", 1)
      .single();
    if (error) throw new Error("Cannot read notification queue.");
    const before = JSON.stringify(data.value);
    const result = work(data.value as State);
    if (before === JSON.stringify(data.value)) return result;
    const commit = await db.rpc("portal_commit", {
      expected_revision: data.revision,
      next_value: data.value,
    });
    if (commit.error) throw new Error("Cannot save notification queue.");
    if (commit.data === true) return result;
  }
  throw new Error("Notification queue is busy.");
}

export function pushConfigured() {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}
export async function deliverNotifications() {
  const configured = pushConfigured();
  const jobs = await update((s) => {
    const now = Date.now();
    generateDeadlineNotifications(s, now);
    const jobs: {
      notificationId: string;
      subscription: NonNullable<State["pushSubscriptions"]>[number];
      lease: number;
    }[] = [];
    if (!configured) return jobs;
    for (const n of s.notifications || []) {
      const user = s.users.find((u) => u.id === n.userId);
      if (
        !user ||
        n.readAt ||
        !notificationVisible(s, n, user) ||
        (n.deadline && Date.parse(n.deadline) <= now)
      )
        continue;
      for (const d of n.deliveries || []) {
        const subscription = s.pushSubscriptions?.find(
          (p) => p.id === d.subscriptionId && p.userId === user.id,
        );
        if (
          !subscription ||
          d.sentAt ||
          d.attempts >= 8 ||
          d.nextAttemptAt > now ||
          jobs.length >= 30 ||
          !pushEndpointAllowed(subscription.endpoint)
        )
          continue;
        d.attempts++;
        d.nextAttemptAt = now + 120000; // Atomic lease prevents concurrent workers sending the same job.
        jobs.push({
          notificationId: n.id,
          subscription,
          lease: d.nextAttemptAt,
        });
      }
    }
    return jobs;
  });
  const results = await Promise.all(
    jobs.map(async (job) => {
      try {
        // Lock-screen payloads never contain private profile, selection or admin content.
        await webpush.sendNotification(
          job.subscription,
          JSON.stringify({
            title: "Team Sweden",
            body: "You have a new notification. Open the portal to read it.",
            tag: job.notificationId,
          }),
          {
            vapidDetails: {
              subject: process.env.VAPID_SUBJECT!,
              publicKey: process.env.VAPID_PUBLIC_KEY!,
              privateKey: process.env.VAPID_PRIVATE_KEY!,
            },
            TTL: 3600,
            timeout: 10000,
          },
        );
        return { ...job, status: 201 };
      } catch (error) {
        return {
          ...job,
          status: (error as { statusCode?: number }).statusCode || 500,
        };
      }
    }),
  );
  if (results.length)
    await update((s) => {
      for (const result of results) {
        const d = s.notifications
          ?.find((n) => n.id === result.notificationId)
          ?.deliveries?.find(
            (d) => d.subscriptionId === result.subscription.id,
          );
        if (!d || d.nextAttemptAt !== result.lease) continue;
        if (result.status === 404 || result.status === 410)
          s.pushSubscriptions = s.pushSubscriptions?.filter(
            (p) => p.id !== result.subscription.id,
          );
        if (result.status < 300) d.sentAt = new Date().toISOString();
        else
          d.nextAttemptAt =
            Date.now() + Math.min(3600000, 60000 * 2 ** d.attempts);
      }
    });
  return {
    configured,
    sent: results.filter((r) => r.status < 300).length,
    failed: results.filter((r) => r.status >= 300).length,
  };
}
