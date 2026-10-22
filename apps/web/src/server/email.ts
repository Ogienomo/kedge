import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /** Stable kind for logs, e.g. "invitation". Never log the message itself. */
  readonly kind: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<{ id: string }>;
}

/** Sends through the Resend HTTP API. */
export function resendSender(apiKey: string, from: string): EmailSender {
  return {
    async send(message) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!res.ok) throw new Error(`Email provider returned ${res.status} for ${message.kind} email`);
      const body = (await res.json()) as { id?: string };
      return { id: body.id ?? "unknown" };
    },
  };
}

/**
 * Development and test sender: writes each message to `.dev-outbox/` as JSON
 * so developers (and e2e tests) can open links without a mail provider.
 */
export function devOutboxSender(dir = join(process.cwd(), ".dev-outbox")): EmailSender {
  return {
    async send(message) {
      const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${id}.json`), JSON.stringify(message, null, 2));
      console.info(`[email] ${message.kind} email written to outbox`, { id });
      return { id };
    },
  };
}

/** Collects messages in memory (integration tests). */
export function memorySender(): EmailSender & { readonly sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      return { id: String(sent.length) };
    },
  };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}
