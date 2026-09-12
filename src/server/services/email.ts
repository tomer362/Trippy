import "server-only";
import { Resend } from "resend";
import { env, features } from "@/env";
import { APP_NAME } from "@/lib/constants";

let client: Resend | null = null;

function resend(): Resend | null {
  if (!features.email) return null;
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}

type SendResult = { sent: boolean; reason?: string };

async function send(to: string, subject: string, html: string, text: string): Promise<SendResult> {
  const mailer = resend();
  if (!mailer) return { sent: false, reason: "email_not_configured" };
  try {
    await mailer.emails.send({ from: env.EMAIL_FROM, to, subject, html, text });
    return { sent: true };
  } catch (err) {
    console.error("email send failed", err);
    return { sent: false, reason: "send_failed" };
  }
}

function layout(title: string, body: string, cta?: { label: string; url: string }) {
  return `<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1c1c22">
  <p style="font-size:20px;font-weight:800;margin:0 0 16px">${APP_NAME}</p>
  <h1 style="font-size:22px;margin:0 0 12px">${title}</h1>
  <div style="font-size:15px;line-height:1.6;color:#44444e">${body}</div>
  ${
    cta
      ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#f2542d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600;display:inline-block">${cta.label}</a></p>`
      : ""
  }
  <p style="font-size:12px;color:#8a8a96;margin-top:32px">You are receiving this because someone shared a trip with you on ${APP_NAME}.</p>
</div>`;
}

export async function sendTripInvite(input: {
  to: string;
  inviterName: string;
  tripName: string;
  role: string;
  url: string;
}): Promise<SendResult> {
  const roleText = input.role === "viewer" ? "view" : "help plan";
  return send(
    input.to,
    `${input.inviterName} invited you to ${input.tripName}`,
    layout(
      `${input.inviterName} invited you to ${input.tripName}`,
      `<p>You can ${roleText} this trip: places, day-by-day itinerary, hotels and bookings, all in one place.</p>`,
      { label: "Open the trip", url: input.url },
    ),
    `${input.inviterName} invited you to ${input.tripName}. Open: ${input.url}`,
  );
}

export async function sendInviteAccepted(input: {
  to: string;
  memberName: string;
  tripName: string;
  url: string;
}): Promise<SendResult> {
  return send(
    input.to,
    `${input.memberName} joined ${input.tripName}`,
    layout(
      `${input.memberName} joined ${input.tripName}`,
      `<p>They can now see and edit the plan with you.</p>`,
      { label: "Open the trip", url: input.url },
    ),
    `${input.memberName} joined ${input.tripName}: ${input.url}`,
  );
}

export async function sendTripReminder(input: {
  to: string;
  tripName: string;
  url: string;
  startsIn: string;
}): Promise<SendResult> {
  return send(
    input.to,
    `${input.tripName} starts ${input.startsIn}`,
    layout(
      `${input.tripName} starts ${input.startsIn}`,
      `<p>Here is your plan, ready to follow.</p>`,
      { label: "Open the trip", url: input.url },
    ),
    `${input.tripName} starts ${input.startsIn}: ${input.url}`,
  );
}
