import { NextResponse } from "next/server";
import { invalidRequest, toPublicError } from "@/lib/errors";
import { runQuickBrief } from "@/lib/v2/quick-brief";
import { assertLiveExecutionEnabled } from "@/lib/v2/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertLiveExecutionEnabled();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw invalidRequest("Request body must be valid JSON.", "INVALID_REQUEST");
    }

    const result = await runQuickBrief(body);
    return NextResponse.json(result);
  } catch (error) {
    const response = toPublicError(error, "The Quick Brief could not be completed.");
    return NextResponse.json(response.body, {
      status: response.status,
      headers: response.headers
    });
  }
}
