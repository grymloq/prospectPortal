self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data.json();
  } catch {
    /* Use a generic fallback. */
  }
  event.waitUntil(
    self.registration.showNotification("Team Sweden", {
      body: "You have a new notification. Open the portal to read it.",
      tag: typeof data.tag === "string" ? data.tag : "team-sweden",
      data: { url: "/?notifications=open" },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows.find(
        (w) => new URL(w.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.navigate("/?notifications=open");
        await existing.focus();
      } else await self.clients.openWindow("/?notifications=open");
    })(),
  );
});
