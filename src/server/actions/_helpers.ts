import "server-only";
import type { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AccessDeniedError } from "@/server/authz";

/** Postgres reports a foreign-key violation as SQLSTATE 23503, wrapped by the driver. */
function isForeignKeyViolation(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && depth < 4; depth++) {
    if (typeof e === "object" && "code" in e && (e as { code?: unknown }).code === "23503")
      return true;
    e = typeof e === "object" && "cause" in e ? (e as { cause?: unknown }).cause : null;
  }
  return false;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Wraps a server action body with auth, validation and uniform error handling. */
export function action<S extends z.ZodType, T>(
  schema: S,
  fn: (input: z.infer<S>, userId: string) => Promise<T>,
) {
  return async (raw: unknown): Promise<ActionResult<T>> => {
    const user = await requireUser();
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".") || "_";
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }
      return { ok: false, error: "Please check the highlighted fields", fieldErrors };
    }
    try {
      const data = await fn(parsed.data, user.id);
      return { ok: true, data };
    } catch (err) {
      if (err instanceof AccessDeniedError) return { ok: false, error: err.message };
      // A composite (id, trip_id) foreign key rejected the write, which means an id in the
      // request belongs to a different trip. Report it as the mistake it is, not as a crash.
      if (isForeignKeyViolation(err))
        return { ok: false, error: "That doesn't belong to this trip" };
      console.error("action failed", err);
      return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
    }
  };
}
