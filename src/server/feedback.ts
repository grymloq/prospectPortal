import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { State, User } from "@/lib/types";
import { requireMember } from "./membership";

export const feedbackCommand = z.object({
  type: z.literal("feedback"),
  category: z.enum(["Suggestion", "Request", "Bug"]),
  text: z.string().trim().max(10000),
  page: z.string().trim().min(1).max(500),
  attachments: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(150),
        data: z.string().max(700000),
      }),
    )
    .max(2),
});

export function feedbackImage(data: string) {
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match) throw new Error("Attach a PNG, JPEG or WebP image.");
  const bytes = Buffer.from(match[2], "base64");
  const valid =
    match[1] === "png"
      ? bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === "jpeg"
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid || bytes.length > 512000)
    throw new Error("Invalid image or image exceeds 500 KB.");
  return { bytes, contentType: `image/${match[1]}` };
}

export function submitFeedback(
  s: State,
  actor: User,
  command: z.infer<typeof feedbackCommand>,
) {
  if (!command.text && !command.attachments.length)
    throw new Error("Enter feedback or attach an image.");
  for (const attachment of command.attachments) feedbackImage(attachment.data);
  s.feedback ||= [];
  s.feedback.unshift({
    id: randomUUID(),
    userId: actor.id,
    authorName: actor.name,
    authorEmail: actor.email,
    category: command.category,
    text: command.text,
    page: command.page,
    createdAt: new Date().toISOString(),
    attachments: command.attachments,
  });
}

export function feedbackAttachment(
  s: State,
  actor: User,
  id: string,
  index: number,
) {
  requireMember(actor);
  if (actor.role !== "admin") throw new Error("Admin access required.");
  const attachment = s.feedback?.find((f) => f.id === id && !f.deletedAt)
    ?.attachments[index];
  if (!attachment?.data) throw new Error("Attachment not found.");
  return feedbackImage(attachment.data);
}
