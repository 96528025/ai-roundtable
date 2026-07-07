import { NextResponse } from "next/server";
import { runRoundtable } from "@/lib/debate";
import { saveMeeting } from "@/lib/history";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { idea?: unknown };
    const idea = typeof body.idea === "string" ? body.idea : "";

    const result = await runRoundtable(idea);
    await saveMeeting(idea, result);

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong while running the roundtable.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
