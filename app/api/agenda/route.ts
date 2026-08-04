import { NextResponse } from "next/server";
import {
  createDiscussionTopics,
  normalizePanelMode,
  validateIdea
} from "@/lib/debate";
import { createRunObserver } from "@/lib/observability";
import { invalidRequest, toPublicError } from "@/lib/errors";
import { assertLiveExecutionEnabled } from "@/lib/v2/validation";

export async function POST(request: Request) {
  const observer = createRunObserver("agenda");

  try {
    assertLiveExecutionEnabled();
    let body: {
      idea?: unknown;
      panelMode?: unknown;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      throw invalidRequest("Request body must be valid JSON.", "INVALID_REQUEST");
    }
    const idea = validateIdea(body.idea);
    const panelMode = normalizePanelMode(body.panelMode);
    const topics = await createDiscussionTopics(idea, panelMode, observer);
    const diagnostics = observer.finish("success");

    return NextResponse.json({ idea, panelMode, topics, diagnostics });
  } catch (error) {
    observer.finish("error");
    const response = toPublicError(error, "The agenda could not be prepared.");

    return NextResponse.json(response.body, {
      status: response.status,
      headers: response.headers
    });
  }
}
