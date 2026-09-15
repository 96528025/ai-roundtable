import { NextResponse } from "next/server";
import { readRequestObject } from "@/lib/request";
import { toPublicError } from "@/lib/errors";
import { runQuickBrief } from "@/lib/v2/quick-brief";
import { assertLiveExecutionEnabled } from "@/lib/v2/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertLiveExecutionEnabled();

    const body = await readRequestObject(request);

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
