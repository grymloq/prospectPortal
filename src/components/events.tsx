"use client";
import { useState } from "react";
import {
  CalendarDays,
  MapPin,
  Users,
  Plus,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Check,
  List,
} from "lucide-react";
import type { TeamEvent, View } from "@/lib/types";
import type { Mutate } from "./workspace";
import {
  Modal,
  Field,
  Badge,
  Empty,
  Avatar,
  dateLabel,
  timeLabel,
  Progress,
} from "./ui";
function localDateTime(iso: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(new Date(iso))
    .replace(" ", "T");
}
function stockholmIso(value: string) {
  let guess = Date.parse(`${value}:00Z`);
  const target = guess;
  for (let i = 0; i < 3; i++) {
    const shown = Date.parse(
      `${localDateTime(new Date(guess).toISOString())}:00Z`,
    );
    guess += target - shown;
  }
  if (localDateTime(new Date(guess).toISOString()) !== value)
    throw new Error(
      "This time does not exist in Stockholm due to daylight saving.",
    );
  return new Date(guess).toISOString();
}
export default function Events({
  view,
  mutate,
}: {
  view: View;
  mutate: Mutate;
}) {
  const [now] = useState(() => Date.now());
  const admin = view.me.role === "admin";
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [mode, setMode] = useState("Calendar"),
    [detailId, setDetailId] = useState(""),
    [edit, setEdit] = useState<TeamEvent | "new" | null>(null),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const detail = view.events.find((e) => e.id === detailId),
    events = [...view.events].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
  const [year, m] = month.split("-").map(Number),
    first = new Date(year, m - 1, 1),
    offset = (first.getDay() + 6) % 7,
    days = new Date(year, m, 0).getDate();
  function shift(delta: number) {
    const d = new Date(year, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  function application(eventId: string) {
    return view.applications.find(
      (a) => a.eventId === eventId && a.userId === view.me.id,
    );
  }
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Team calendar</h1>
          <p>Show up. Put in the work. Grow together.</p>
        </div>
        {admin && (
          <button
            className="primary"
            onClick={() => {
              setEdit("new");
              setFormError("");
            }}
          >
            <Plus size={17} />
            Create event
          </button>
        )}
      </header>
      <div className="calendar-layout">
        <section className="panel padded">
          <div className="section-heading">
            <div className="row">
              <button
                className="icon-button"
                aria-label="Previous month"
                onClick={() => shift(-1)}
              >
                <ChevronLeft size={19} />
              </button>
              <h2>
                {first.toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <button
                className="icon-button"
                aria-label="Next month"
                onClick={() => shift(1)}
              >
                <ChevronRight size={19} />
              </button>
            </div>
            <div className="segmented">
              {["Calendar", "Agenda"].map((v) => (
                <button
                  key={v}
                  className={mode === v ? "active" : ""}
                  onClick={() => setMode(v)}
                >
                  {v === "Calendar" ? (
                    <CalendarDays size={15} />
                  ) : (
                    <List size={15} />
                  )}{" "}
                  {v}
                </button>
              ))}
            </div>
          </div>
          {mode === "Calendar" ? (
            <div className="calendar-grid">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <div className="weekday" key={d}>
                  {d}
                </div>
              ))}
              {Array.from(
                { length: Math.ceil((days + offset) / 7) * 7 },
                (_, i) => {
                  const day = i - offset + 1,
                    date = `${month}-${String(day).padStart(2, "0")}`;
                  return (
                    <div
                      className={`calendar-day ${day < 1 || day > days ? "outside" : ""} ${date === new Date().toISOString().slice(0, 10) ? "today" : ""}`}
                      key={i}
                    >
                      {day > 0 && day <= days && (
                        <>
                          <span>{day}</span>
                          {events
                            .filter(
                              (e) =>
                                localDateTime(e.startsAt).slice(0, 10) <=
                                  date &&
                                localDateTime(e.endsAt).slice(0, 10) >= date,
                            )
                            .map((e) => (
                              <button
                                className={e.cancelled ? "cancelled" : ""}
                                key={e.id}
                                onClick={() => setDetailId(e.id)}
                              >
                                <small>{timeLabel(e.startsAt)}</small>
                                {e.title}
                              </button>
                            ))}
                        </>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          ) : (
            <div>
              {events
                .filter((e) => localDateTime(e.startsAt).startsWith(month))
                .map((e) => (
                  <button
                    className="agenda-row"
                    key={e.id}
                    onClick={() => setDetailId(e.id)}
                  >
                    <span className="event-date">
                      <strong>{new Date(e.startsAt).getUTCDate()}</strong>
                      <small>{dateLabel(e.startsAt).split(" ")[1]}</small>
                    </span>
                    <span>
                      <strong>{e.title}</strong>
                      <small>
                        {e.location} · {timeLabel(e.startsAt)}
                      </small>
                    </span>
                    <Badge tone={e.cancelled ? "red" : "blue"}>
                      {e.cancelled
                        ? "Cancelled"
                        : application(e.id)?.status || "Open to apply"}
                    </Badge>
                    <ArrowRight size={17} />
                  </button>
                ))}
              {!events.some((e) =>
                localDateTime(e.startsAt).startsWith(month),
              ) && (
                <Empty
                  title="A little breathing room"
                  description="There are no events scheduled this month."
                />
              )}
            </div>
          )}
          <div className="table-footer">
            All times in Europe/Stockholm<span>All members can apply</span>
          </div>
        </section>
        <aside>
          <h3 className="aside-title">Coming up</h3>
          {events
            .filter((e) => !e.cancelled && Date.parse(e.endsAt) > now)
            .map((e) => (
              <section className="panel event-card" key={e.id}>
                <div className="row between">
                  <span className="event-date">
                    <strong>{new Date(e.startsAt).getUTCDate()}</strong>
                    <small>{dateLabel(e.startsAt).split(" ")[1]}</small>
                  </span>
                  {application(e.id) && (
                    <Badge
                      tone={
                        application(e.id)?.status === "Approved"
                          ? "green"
                          : "amber"
                      }
                    >
                      {application(e.id)?.status}
                    </Badge>
                  )}
                </div>
                <h3>{e.title}</h3>
                <p>
                  <MapPin size={15} />
                  {e.location}
                </p>
                <p>
                  <Users size={15} />
                  {view.occupancy[e.id] || 0} / {e.capacity} approved
                </p>
                <Progress value={view.occupancy[e.id] || 0} max={e.capacity} />
                <button className="full" onClick={() => setDetailId(e.id)}>
                  View event
                  <ArrowRight size={16} />
                </button>
              </section>
            ))}
        </aside>
      </div>
      {detail && (
        <Modal title={detail.title} wide onClose={() => setDetailId("")}>
          <div className="event-detail-meta">
            <span>
              <MapPin size={17} />
              {detail.location}
            </span>
            <span>
              <CalendarDays size={17} />
              {dateLabel(detail.startsAt)} · {timeLabel(detail.startsAt)} –{" "}
              {dateLabel(detail.endsAt)} · {timeLabel(detail.endsAt)}
            </span>
            <span>
              <Users size={17} />
              {view.occupancy[detail.id] || 0} / {detail.capacity} approved
            </span>
          </div>
          <p className="preserve">{detail.description}</p>
          <div className="section-heading">
            <Badge tone={detail.cancelled ? "red" : "blue"}>
              {detail.cancelled
                ? "Cancelled"
                : application(detail.id)?.status || "Open to apply"}
            </Badge>
            <div className="row">
              {admin && (
                <button
                  onClick={() => {
                    setEdit(detail);
                    setFormError("");
                    setDetailId("");
                  }}
                >
                  <Pencil size={15} />
                  Edit event
                </button>
              )}
              {!detail.cancelled && Date.parse(detail.endsAt) > now && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await mutate({
                      type: "eventApply",
                      eventId: detail.id,
                      withdraw: ["Pending", "Approved"].includes(
                        application(detail.id)?.status || "",
                      ),
                    });
                    setBusy(false);
                  }}
                >
                  {["Pending", "Approved"].includes(
                    application(detail.id)?.status || "",
                  )
                    ? "Withdraw application"
                    : "Apply to attend"}
                </button>
              )}
            </div>
          </div>
          <small>
            Applications are reviewed by admins. Applying does not reserve a
            place.
          </small>
          {admin && (
            <>
              <hr />
              <h3>Attendance applications</h3>
              {view.applications
                .filter((a) => a.eventId === detail.id)
                .map((a) => {
                  const u = view.users.find((u) => u.id === a.userId)!;
                  return (
                    <div className="list-row" key={a.id}>
                      <div className="row">
                        <Avatar name={u.name} />
                        <strong>{u.name}</strong>
                      </div>
                      <div className="row">
                        <Badge
                          tone={a.status === "Approved" ? "green" : "neutral"}
                        >
                          {a.status}
                        </Badge>
                        {a.status !== "Withdrawn" && !detail.cancelled && (
                          <>
                            <button
                              disabled={busy || a.status === "Approved"}
                              onClick={async () => {
                                setBusy(true);
                                await mutate({
                                  type: "eventDecision",
                                  id: a.id,
                                  status: "Approved",
                                });
                                setBusy(false);
                              }}
                            >
                              Approve
                            </button>
                            <button
                              disabled={busy || a.status === "Declined"}
                              onClick={async () => {
                                setBusy(true);
                                await mutate({
                                  type: "eventDecision",
                                  id: a.id,
                                  status: "Declined",
                                });
                                setBusy(false);
                              }}
                            >
                              Decline
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              {!view.applications.some((a) => a.eventId === detail.id) && (
                <Empty
                  title="No applications yet"
                  description="Members can apply from their calendar."
                />
              )}
            </>
          )}
        </Modal>
      )}
      {edit && (
        <Modal
          title={edit === "new" ? "Create an event" : "Edit event"}
          onClose={() => setEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              setFormError("");
              try {
                const ok = await mutate({
                  type: "event",
                  ...(edit !== "new" ? { id: edit.id } : {}),
                  title: f.get("title"),
                  location: f.get("location"),
                  startsAt: stockholmIso(String(f.get("start"))),
                  endsAt: stockholmIso(String(f.get("end"))),
                  capacity: Number(f.get("capacity")),
                  description: f.get("description"),
                  cancelled: f.get("cancelled") === "on",
                });
                if (ok) setEdit(null);
              } catch (e) {
                setFormError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Event name">
              <input
                name="title"
                required
                defaultValue={edit === "new" ? "" : edit.title}
              />
            </Field>
            <Field label="Where">
              <input
                name="location"
                required
                placeholder="Venue, city, address"
                defaultValue={edit === "new" ? "" : edit.location}
              />
            </Field>
            <div className="form-grid">
              <Field label="Starts (Stockholm time)">
                <input
                  type="datetime-local"
                  name="start"
                  required
                  defaultValue={
                    edit === "new" ? "" : localDateTime(edit.startsAt)
                  }
                />
              </Field>
              <Field label="Ends (Stockholm time)">
                <input
                  type="datetime-local"
                  name="end"
                  required
                  defaultValue={
                    edit === "new" ? "" : localDateTime(edit.endsAt)
                  }
                />
              </Field>
            </div>
            <Field label="Player places">
              <input
                type="number"
                min={1}
                max={1000}
                name="capacity"
                required
                defaultValue={edit === "new" ? 8 : edit.capacity}
              />
            </Field>
            <Field label="Details & preparation">
              <textarea
                name="description"
                defaultValue={edit === "new" ? "" : edit.description}
              />
            </Field>
            {edit !== "new" && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="cancelled"
                  defaultChecked={edit.cancelled}
                />
                Cancel this event
              </label>
            )}
            {formError && <p className="error">{formError}</p>}
            <div className="form-footer">
              <button type="button" onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                <Check size={16} />
                Save event
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
