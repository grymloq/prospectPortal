"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import type { PortalNotification, View } from "@/lib/types";
import type { Mutate } from "./workspace";
import styles from "./notifications.module.css";

export async function disableDevicePush() {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription) {
    await subscription.unsubscribe();
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "pushUnsubscribe",
        endpoint: subscription.endpoint,
      }),
    });
  }
}

export default function Notifications({
  view,
  mutate,
  navigate,
}: {
  view: View;
  mutate: Mutate;
  navigate: (n: PortalNotification) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(view.notifications || []);
  const [key, setKey] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const bell = useRef<HTMLButtonElement>(null);
  const preview = !!view.accessPreview?.active;
  useEffect(() => {
    const controller = new AbortController();
    async function refresh() {
      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.ok) setItems((await response.json()).notifications);
        else if (response.status === 401 || response.status === 403)
          setItems([]);
      } catch {
        /* Retry on the next poll. */
      }
    }
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener("focus", focus);
    };
  }, [view.notifications, view.me.id, preview]);
  useEffect(() => {
    let active = true;
    async function setup() {
      const available =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (active) setSupported(available);
      if (
        new URLSearchParams(location.search).get("notifications") === "open" &&
        active
      )
        setOpen(true);
      if (!available || preview) return;
      try {
        const response = await fetch("/api/notifications/config");
        const config = await response.json();
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        const deviceId = subscription
          ? Array.from(
              new Uint8Array(
                await crypto.subtle.digest(
                  "SHA-256",
                  new TextEncoder().encode(subscription.endpoint),
                ),
              ),
            )
              .map((b) => b.toString(16).padStart(2, "0"))
              .join("")
          : "";
        if (active) {
          setKey(config.publicKey);
          setEnabled(!!deviceId && !!view.pushDeviceIds?.includes(deviceId));
        }
      } catch {
        /* In-app notifications still work. */
      }
    }
    void setup();
    return () => {
      active = false;
    };
  }, [preview, view.pushDeviceIds]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        bell.current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  async function read(id?: string) {
    if (preview) return true;
    const ok = await mutate({
      type: "notificationRead",
      ...(id ? { id } : {}),
    });
    if (ok)
      setItems((items) =>
        items.map((n) =>
          !id || n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      );
    return ok;
  }
  async function togglePush() {
    setBusy(true);
    setError("");
    try {
      if (enabled) {
        await disableDevicePush();
        setEnabled(false);
        return;
      }
      if (!key) throw new Error("Push notifications are not configured yet.");
      if ((await Notification.requestPermission()) !== "granted")
        throw new Error(
          "Allow notifications in your browser settings to enable push.",
        );
      await navigator.serviceWorker.register("/sw.js");
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const data = subscription.toJSON();
      if (
        !(await mutate({
          type: "pushSubscribe",
          endpoint: data.endpoint,
          keys: data.keys,
        }))
      ) {
        await subscription.unsubscribe();
        throw new Error("Could not save this device. Please retry.");
      }
      setEnabled(true);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const count = items.filter((n) => !n.readAt).length;
  return (
    <div ref={root} className={styles.root}>
      <button
        ref={bell}
        className={`icon-button ${styles.bell}`}
        aria-label={`Notifications, ${count} unread`}
        aria-expanded={open}
        aria-controls="notification-panel"
        onClick={() => setOpen(!open)}
      >
        <Bell size={20} />
        {count > 0 && (
          <span className={styles.count}>{count > 99 ? "99+" : count}</span>
        )}
      </button>
      {open && (
        <section
          id="notification-panel"
          className={styles.panel}
          aria-label="Notifications"
        >
          <div className={styles.heading}>
            <h2>Notifications</h2>
            <button
              className="icon-button"
              aria-label="Close notifications"
              onClick={() => {
                setOpen(false);
                bell.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </div>
          <div className={styles.controls}>
            <button
              disabled={preview || !count || busy}
              onClick={async () => {
                setBusy(true);
                await read();
                setBusy(false);
              }}
            >
              Mark all read
            </button>
            {!preview && supported && (
              <button disabled={busy || !key} onClick={togglePush}>
                {enabled ? "Disable push" : "Enable push"}
              </button>
            )}
          </div>
          {!preview && !supported && (
            <p className={styles.hint}>
              Push is unavailable in this browser. On iPhone or iPad, add this
              site to your Home Screen and open it there.
            </p>
          )}
          {!preview && supported && !key && (
            <p className={styles.hint}>Device push is not configured yet.</p>
          )}
          {error && (
            <p role="alert" className={styles.hint}>
              {error}
            </p>
          )}
          <div className={styles.list}>
            {!items.length && (
              <p className={styles.hint}>You’re all caught up.</p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                className={`${styles.item} ${!n.readAt ? styles.unread : ""}`}
                onClick={async () => {
                  if (await read(n.id)) {
                    navigate(n);
                    setOpen(false);
                  }
                }}
              >
                <span>{n.title}</span>
                <small>
                  {new Date(n.createdAt).toLocaleString("en-GB")}
                  {!n.readAt ? " · New" : ""}
                </small>
                {n.deadline && (
                  <small>
                    Due {new Date(n.deadline).toLocaleString("en-GB")}
                  </small>
                )}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
