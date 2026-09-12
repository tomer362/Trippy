import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env, features } from "@/env";
import { getSession } from "@/lib/auth";
import { getTripAccess } from "@/server/authz";
import { UPLOAD_LIMITS } from "@/server/services/storage";

const payloadSchema = z.object({
  tripId: z.string(),
  kind: z.enum(["attachment", "journal", "cover"]),
});

/**
 * Issues a short-lived, scoped upload token. The browser then uploads directly to the store,
 * so large files never travel through a serverless function.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!features.blob)
    return NextResponse.json({ error: "uploads_not_configured" }, { status: 503 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      token: env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const parsed = payloadSchema.safeParse(JSON.parse(clientPayload ?? "{}"));
        if (!parsed.success) throw new Error("Missing upload context");
        const access = await getTripAccess(parsed.data.tripId, session.user.id);
        if (!access?.canEdit) throw new Error("You can only upload to trips you can edit");
        const limits = UPLOAD_LIMITS[parsed.data.kind];
        return {
          allowedContentTypes: limits.contentTypes,
          maximumSizeInBytes: limits.maxBytes,
          addRandomSuffix: true,
          tokenPayload: clientPayload,
        };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "upload_failed" },
      { status: 400 },
    );
  }
}
