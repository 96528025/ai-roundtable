import { invalidRequest } from "@/lib/errors";

export async function readRequestObject(request: Request): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw invalidRequest("Request body must be valid JSON.");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw invalidRequest("Request body must be a JSON object.");
  }
  return body as Record<string, unknown>;
}
