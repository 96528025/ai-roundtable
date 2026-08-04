import { NextResponse } from "next/server";
import { runRoundtable } from "@/lib/debate";
import { saveMeeting } from "@/lib/history";
import { invalidRequest, toPublicError } from "@/lib/errors";
import { assertLiveExecutionEnabled } from "@/lib/v2/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertLiveExecutionEnabled();
    let body: {
      idea?: unknown;
      topics?: unknown;
      panelMode?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw invalidRequest("Request body must be valid JSON.", "INVALID_REQUEST");
    }
    const idea = typeof body.idea === "string" ? body.idea : "";

    const result = await runRoundtable(idea, body.topics, body.panelMode);
    try {
      await saveMeeting(idea, result);
    } catch {
      console.warn(
        JSON.stringify({
          event: "history_write_failed",
          runId: result.diagnostics?.runId,
          message: "The result was returned, but local meeting history could not be written."
        })
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    const response = toPublicError(
      error,
      "Something went wrong while running the roundtable."
    );

    return NextResponse.json(response.body, {
      status: response.status,
      headers: response.headers
    });
  }
}
