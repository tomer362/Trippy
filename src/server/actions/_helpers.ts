import "server-only";
import type { z } from "zod";
import { requireUser } from "@/lib/auth";
import { AccessDeniedError } from "@/server/authz";

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
      console.error("action failed", err);
      return { ok: false, error: err instanceof Error ? err.message : "Something went wrong" };
    }
  };
}
