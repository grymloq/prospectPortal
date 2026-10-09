import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { State, User, PortalNotification } from "@/lib/types";
import { requireMember } from "./membership";

export const notificationCommands = [
  z.object({
    type: z.literal("notificationRead"),
    id: z.string().max(100).optional(),
  }),
  z.object({
    type: z.literal("pushSubscribe"),
    endpoint: z.url().max(4096),
    keys: z.object({
      auth: z.string().regex(/^[\w-]{22}$/),
      p256dh: z.string().regex(/^[\w-]{87}$/),
    }),
  }),
  z.object({
    type: z.literal("pushUnsubscribe"),
    endpoint: z.string().max(4096),
  }),
] as const;

export function pushEndpointAllowed(endpoint: string) {
  const url = new URL(endpoint);
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    !url.port &&
    (url.hostname === "fcm.googleapis.com" ||
      url.hostname === "updates.push.services.mozilla.com" ||
      url.hostname === "web.push.apple.com" ||
      url.hostname.endsWith(".notify.windows.com"))
  );
}

export function notificationVisible(
  s: State,
  n: PortalNotification,
  actor: User,
) {
  if (
    actor.removedAt ||
    !actor.confirmedMember ||
    n.userId !== actor.id ||
    (n.adminOnly && actor.role !== "admin")
  )
    return false;
  if (n.eventId) {
    const event = s.events.find((e) => e.id === n.eventId);
    if (!event || event.cancelled) return false;
    const scrim = s.scrims?.find((x) => x.eventId === event.id);
    if (scrim) {
      if (
        scrim.cancelled ||
        scrim.completedAt ||
        (!scrim.organizers?.some((p) => p.userId === actor.id) &&
          !scrim.teams.some(
            (t) =>
              t.captainId === actor.id ||
              t.entries.some((e) => e.userId === actor.id) ||
              t.additionalCaptains?.some((c) => c.userId === actor.id) ||
              t.coaches?.some((c) => c.userId === actor.id),
          ))
      )
        return false;
    } else if (
      !s.applications.some(
        (a) =>
          a.eventId === event.id &&
          a.userId === actor.id &&
          a.status === "Approved",
      )
    )
      return false;
    if (
      n.deadline &&
      ![
        event.startsAt,
        event.endsAt,
        ...(event.deadlines || []).map((d) => d.at),
        scrim?.submissionDeadline,
      ].includes(n.deadline)
    )
      return false;
  }
  return true;
}

export function notificationView(s: State, actor: User) {
  return (s.notifications || [])
    .filter((n) => notificationVisible(s, n, actor))
    .map((n) => {
      const { deliveries, ...safe } = n;
      void deliveries;
      return safe;
    });
}

export function notify(
  s: State,
  users: User[],
  fields: Omit<PortalNotification, "id" | "userId" | "createdAt">,
  now = Date.now(),
) {
  s.notifications ||= [];
  for (const user of users) {
    if (
      !user.confirmedMember ||
      user.removedAt ||
      s.notifications.some((n) => n.userId === user.id && n.key === fields.key)
    )
      continue;
    s.notifications.unshift({
      ...fields,
      id: randomUUID(),
      userId: user.id,
      createdAt: new Date(now).toISOString(),
      deliveries: (s.pushSubscriptions || [])
        .filter((p) => p.userId === user.id)
        .map((p) => ({
          subscriptionId: p.id,
          attempts: 0,
          nextAttemptAt: now,
        })),
    });
  }
}
const admins = (s: State) => s.users.filter((u) => u.role === "admin");
export function notifyRegistration(s: State, user: User) {
  if (!user.confirmedMember && !user.removedAt)
    notify(s, admins(s), {
      key: `registration:${user.id}`,
      title: `${user.name} is awaiting membership confirmation`,
      page: "Users",
      adminOnly: true,
    });
}

// Capture only fields needed for detecting changes; no large army catalogues or attachments.
export function notificationSnapshot(s: State) {
  return {
    users: s.users.map((u) => ({ ...u })),
    messages: new Set(s.messages.map((m) => m.id)),
    feedback: new Set(s.feedback?.map((f) => f.id)),
  };
}
export function notifyChanges(
  s: State,
  before: ReturnType<typeof notificationSnapshot>,
  actorId?: string,
) {
  for (const user of s.users) {
    const old = before.users.find((u) => u.id === user.id);
    if (!old) {
      notifyRegistration(s, user);
      continue;
    }
    if (
      user.phaseId !== old.phaseId ||
      user.rejected !== old.rejected ||
      user.role !== old.role ||
      user.confirmedMember !== old.confirmedMember
    ) {
      const status = user.rejected
        ? "Not selected"
        : s.phases.find((p) => p.id === user.phaseId)?.name || "Member";
      notify(s, [user], {
        key: randomUUID(),
        title: `Your status was updated: ${status}${user.role === "admin" ? " · Administrator" : ""}`,
        page: "Profile",
        profileId: user.id,
      });
    }
    if (
      (user.application !== old.application ||
        user.phaseId !== old.phaseId ||
        (old.rejected && !user.rejected)) &&
      user.phaseId &&
      s.phases.find((p) => p.id === user.phaseId)?.kind === "application"
    ) {
      notify(
        s,
        admins(s).filter((u) => u.id !== actorId),
        {
          key: randomUUID(),
          title: `${user.name} submitted a prospect application`,
          page: "Profile",
          profileId: user.id,
          adminOnly: true,
        },
      );
    }
  }
  for (const m of s.messages.filter((m) => !before.messages.has(m.id))) {
    const recipients = s.users.filter(
      (u) =>
        u.id !== m.authorId &&
        (u.role === "admin" || (!m.internal && u.id === m.userId)),
    );
    for (const user of recipients)
      notify(s, [user], {
        key: `message:${m.id}`,
        title: m.internal
          ? "New internal profile discussion"
          : "New profile conversation message",
        page: "Profile",
        profileId: m.userId,
        adminOnly: m.internal || user.id !== m.userId,
      });
  }
  for (const f of (s.feedback || []).filter((f) => !before.feedback.has(f.id)))
    notify(
      s,
      admins(s).filter((u) => u.id !== actorId),
      {
        key: `feedback:${f.id}`,
        title: `${f.authorName} submitted ${f.category.toLowerCase()} feedback`,
        page: "Feedback inbox",
        adminOnly: true,
      },
    );
}

export function generateDeadlineNotifications(s: State, now = Date.now()) {
  for (const event of s.events.filter((e) => !e.cancelled)) {
    const scrim = s.scrims?.find((x) => x.eventId === event.id);
    if (scrim?.cancelled || scrim?.completedAt) continue;
    const deadlines = [
      { id: "start", title: "Starts", at: event.startsAt },
      { id: "end", title: "Ends", at: event.endsAt },
      ...(event.deadlines || []),
      ...(scrim
        ? [{ id: "lists", title: "Lists due", at: scrim.submissionDeadline }]
        : []),
    ];
    for (const d of deadlines) {
      const remaining = Date.parse(d.at) - now;
      if (!(remaining > 0 && remaining <= 86400000)) continue;
      const fields = {
        key: `deadline:${event.id}:${d.id}:${d.at}`,
        title: `${event.title} — ${d.title} within 24 hours`,
        page: scrim ? ("Scrims" as const) : ("Calendar" as const),
        eventId: event.id,
        scrimId: scrim?.id,
        deadline: d.at,
      };
      const recipients = s.users.filter((u) =>
        notificationVisible(
          s,
          { ...fields, id: "", userId: u.id, createdAt: "" },
          u,
        ),
      );
      notify(s, recipients, fields, now);
    }
  }
  // Bounded retention; deadline timestamps are already past before keys expire.
  s.notifications = (s.notifications || []).filter(
    (n) => Date.parse(n.createdAt) > now - 90 * 86400000,
  );
}

export function executeNotification(
  s: State,
  actor: User,
  c: z.infer<(typeof notificationCommands)[number]>,
) {
  requireMember(actor);
  if (c.type === "notificationRead") {
    const found = (s.notifications || []).filter(
      (n) => notificationVisible(s, n, actor) && (!c.id || n.id === c.id),
    );
    if (c.id && !found.length) throw new Error("Notification not found.");
    for (const n of found) n.readAt ||= new Date().toISOString();
  } else if (c.type === "pushUnsubscribe") {
    s.pushSubscriptions = (s.pushSubscriptions || []).filter(
      (p) => p.userId !== actor.id || p.endpoint !== c.endpoint,
    );
  } else {
    if (!pushEndpointAllowed(c.endpoint))
      throw new Error("Unsupported push service.");
    s.pushSubscriptions ||= [];
    const existing = s.pushSubscriptions.find((p) => p.endpoint === c.endpoint);
    if (existing?.userId === actor.id) {
      existing.keys = c.keys;
      return;
    }
    if (s.pushSubscriptions.filter((p) => p.userId === actor.id).length >= 10)
      throw new Error(
        "Too many subscribed devices. Disable push on an old device first.",
      );
    s.pushSubscriptions = s.pushSubscriptions.filter(
      (p) => p.endpoint !== c.endpoint,
    );
    s.pushSubscriptions.push({
      id: randomUUID(),
      userId: actor.id,
      endpoint: c.endpoint,
      keys: c.keys,
    });
  }
}
