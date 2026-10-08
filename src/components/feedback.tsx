"use client";
import { Fragment, useState } from "react";
import { Camera, MessageSquare, Paperclip } from "lucide-react";
import type { FeedbackAttachment, Feedback, View } from "@/lib/types";
import type { Mutate } from "./workspace";
import { Field, Modal } from "./ui";
import styles from "./feedback.module.css";

async function imageAttachment(
  source: CanvasImageSource,
  width: number,
  height: number,
  name: string,
): Promise<FeedbackAttachment> {
  const canvas = document.createElement("canvas");
  let scale = Math.min(1, 1800 / Math.max(width, height));
  for (let attempt = 0; attempt < 5; attempt++) {
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the image.");
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.85);
    if (data.length < 680000) return { name: name.slice(0, 140), data };
    scale *= 0.75;
  }
  throw new Error("This image is too large. Choose a smaller image.");
}

export default function BetaFeedback({
  mutate,
  page,
}: {
  mutate: Mutate;
  page: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        data-html2canvas-ignore
        className={styles.launcher}
        onClick={() => setOpen(true)}
      >
        <MessageSquare size={17} /> BETA FEEDBACK
      </button>
      {open && (
        <FeedbackForm
          mutate={mutate}
          page={page}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function FeedbackForm({
  mutate,
  page,
  onClose,
}: {
  mutate: Mutate;
  page: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState<{
    category: Feedback["category"];
    text: string;
    attachments: FeedbackAttachment[];
    page: string;
  }>({ category: "Suggestion", text: "", attachments: [], page });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function add(attachment: FeedbackAttachment) {
    setForm((f) => ({
      ...f,
      attachments: [...f.attachments, attachment].slice(0, 2),
    }));
  }
  async function upload(file?: File) {
    if (!file) return;
    setError("");
    setBusy(true);
    let bitmap: ImageBitmap | undefined;
    try {
      if (
        !/^image\/(png|jpeg|webp)$/.test(file.type) ||
        file.size > 20 * 1024 * 1024
      )
        throw new Error("Choose a PNG, JPEG or WebP image up to 20 MB.");
      bitmap = await createImageBitmap(file);
      add(
        await imageAttachment(bitmap, bitmap.width, bitmap.height, file.name),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      bitmap?.close();
      setBusy(false);
    }
  }
  async function screenshot() {
    setError("");
    setBusy(true);
    try {
      const { default: html2canvas } = await import("html2canvas");
      const canvas = await html2canvas(document.body, {
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
        scale: 1,
        useCORS: true,
        logging: false,
        onclone: (doc) => {
          doc.querySelectorAll("dialog").forEach((dialog) => dialog.remove());
        },
      });
      add(
        await imageAttachment(
          canvas,
          canvas.width,
          canvas.height,
          "Page screenshot.jpg",
        ),
      );
    } catch (e) {
      console.error("Feedback screenshot failed", e);
      setError(
        "Could not capture this page. Attach a screenshot from your device instead.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Beta feedback"
      onClose={onClose}
      busy={busy}
      draftKey="beta-feedback"
      draft={{ value: form, restore: setForm }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const saved = await mutate({ type: "feedback", ...form }, setError);
          setBusy(false);
          if (saved) onClose();
        }}
      >
        <p>Share an idea, request a feature, or tell us what went wrong.</p>
        <Field label="Label">
          <select
            aria-label="Feedback label"
            value={form.category}
            disabled={busy}
            onChange={(e) =>
              setForm({
                ...form,
                category: e.target.value as Feedback["category"],
              })
            }
          >
            <option>Suggestion</option>
            <option>Request</option>
            <option>Bug</option>
          </select>
        </Field>
        <Field label="Your feedback">
          <textarea
            name="feedback"
            rows={6}
            maxLength={10000}
            value={form.text}
            disabled={busy}
            placeholder="Tell us anything…"
            onChange={(e) => setForm({ ...form, text: e.target.value })}
          />
        </Field>
        <div className={styles.attachControls}>
          <label className={styles.upload}>
            <Paperclip size={16} /> Attach image
            <input
              aria-label="Attach image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy || form.attachments.length >= 2}
              onChange={(e) => {
                void upload(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button
            type="button"
            disabled={busy || form.attachments.length >= 2}
            onClick={screenshot}
          >
            <Camera size={16} /> Take screenshot
          </button>
        </div>
        <p className="muted">
          Up to 2 images. Screenshots capture the visible page without this
          form. Review images below before sending.
        </p>
        <div className={styles.previews}>
          {form.attachments.map((a, i) => (
            <figure key={i}>
              {/* Local image previews and authenticated inbox images cannot use the public image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.data} alt={a.name} />
              <figcaption>
                {a.name}{" "}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setForm({
                      ...form,
                      attachments: form.attachments.filter(
                        (_, index) => index !== i,
                      ),
                    })
                  }
                >
                  Remove
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button type="button" data-modal-close disabled={busy}>
            Cancel
          </button>
          <button
            className="primary"
            disabled={busy || (!form.text.trim() && !form.attachments.length)}
          >
            {busy ? "Please wait…" : "Send feedback"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function FeedbackInbox({
  view,
  mutate,
}: {
  view: View;
  mutate: Mutate;
}) {
  const [expanded, setExpanded] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [deleted, setDeleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function update(command: object) {
    setBusy(true);
    setError("");
    await mutate(command, setError);
    setBusy(false);
  }
  const items = (view.feedback || []).filter(
    (f) =>
      Boolean(f.deletedAt) === deleted &&
      (category === "All" || f.category === category) &&
      `${f.authorName} ${f.authorEmail} ${f.text} ${f.page}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div>
      <header className="page-heading">
        <div>
          <h1>Feedback inbox</h1>
          <p>
            Beta feedback from the team. Expand a message to see its details and
            images.
          </p>
        </div>
      </header>
      <div className={styles.filters}>
        <Field label="Folder">
          <select
            aria-label="Feedback folder"
            value={deleted ? "Deleted" : "Inbox"}
            onChange={(e) => {
              setDeleted(e.target.value === "Deleted");
              setExpanded("");
            }}
          >
            <option>Inbox</option>
            <option>Deleted</option>
          </select>
        </Field>
        <Field label="Search feedback">
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </Field>
        <Field label="Label">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option>All</option>
            <option>Suggestion</option>
            <option>Request</option>
            <option>Bug</option>
          </select>
        </Field>
      </div>
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Received</th>
              <th>From</th>
              <th>Label</th>
              <th>Message</th>
              <th>Images</th>
              <th>Status</th>
              <th>
                <span className="sr-only">Details</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((f) => (
              <Fragment key={f.id}>
                <tr
                  className={!f.readAt && !deleted ? styles.unread : undefined}
                >
                  <td>{new Date(f.createdAt).toLocaleString("en-GB")}</td>
                  <td>{f.authorName}</td>
                  <td>{f.category}</td>
                  <td className={styles.summary}>
                    {f.text.slice(0, 100) || "Image feedback"}
                    {f.text.length > 100 ? "…" : ""}
                  </td>
                  <td>{f.attachments.length}</td>
                  <td>{f.readAt ? "Read" : "Unread"}</td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        className="small"
                        aria-expanded={expanded === f.id}
                        aria-controls={`feedback-${f.id}`}
                        onClick={() =>
                          setExpanded(expanded === f.id ? "" : f.id)
                        }
                      >
                        {expanded === f.id ? "Collapse" : "Expand"}
                      </button>
                      {!deleted && (
                        <button
                          className="small"
                          disabled={busy}
                          onClick={() =>
                            update({
                              type: "feedbackRead",
                              id: f.id,
                              read: !f.readAt,
                            })
                          }
                        >
                          {f.readAt ? "Mark unread" : "Mark read"}
                        </button>
                      )}
                      <button
                        className={`small ${deleted ? "" : "danger"}`}
                        disabled={busy}
                        onClick={() =>
                          update({
                            type: deleted
                              ? "feedbackRestore"
                              : "feedbackDelete",
                            id: f.id,
                          })
                        }
                      >
                        {deleted ? "Restore" : "Delete"}
                      </button>
                    </div>
                  </td>
                </tr>
                {expanded === f.id && (
                  <tr id={`feedback-${f.id}`}>
                    <td colSpan={7}>
                      <article className={styles.detail}>
                        <p>
                          <strong>{f.authorName}</strong> · {f.authorEmail}
                        </p>
                        <p className="muted">Page: {f.page}</p>
                        <p className={styles.message}>
                          {f.text || "No written message."}
                        </p>
                        {!deleted && (
                          <div className={styles.previews}>
                            {f.attachments.map((a, i) => (
                              <figure key={i}>
                                <a
                                  href={`/api/feedback/${f.id}/${i}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    loading="lazy"
                                    src={`/api/feedback/${f.id}/${i}`}
                                    alt={a.name}
                                  />
                                </a>
                                <figcaption>{a.name}</figcaption>
                              </figure>
                            ))}
                          </div>
                        )}
                      </article>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!items.length && (
              <tr>
                <td colSpan={7}>
                  {view.feedback?.length
                    ? "No matching feedback."
                    : deleted
                      ? "No deleted feedback."
                      : "No feedback yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
