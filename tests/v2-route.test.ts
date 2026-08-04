import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as quickBriefRoute } from "@/app/api/brief/route";
import { POST as agendaRoute } from "@/app/api/agenda/route";
import { POST as roundtableRoute } from "@/app/api/roundtable/route";
import { ideaBriefFixture, ideaFrameFixture } from "./v2-fixtures";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function request(body: unknown): Request {
  return new Request("http://localhost/api/brief", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

function reply(value: unknown): Response {
  return new Response(
    JSON.stringify({
      model: "test-model",
      content: [{ type: "text", text: JSON.stringify(value) }],
      usage: { input_tokens: 100, output_tokens: 50 }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

const validRequest = {
  idea: "A browser extension that turns shopping tabs into a decision brief.",
  constraints: []
};

describe("Quick Brief route", () => {
  it("hard-disables model execution in sample-only deployments", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "sample");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key-that-must-not-be-used");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await quickBriefRoute(request(validRequest));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "LIVE_MODE_DISABLED",
      retryable: false
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applies the sample-only execution guard to legacy model routes", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "sample");
    vi.stubEnv("ANTHROPIC_API_KEY", "a-key-that-must-not-be-used");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const agendaResponse = await agendaRoute(
      request({ idea: validRequest.idea, panelMode: "startup" })
    );
    const roundtableResponse = await roundtableRoute(
      request({
        idea: validRequest.idea,
        panelMode: "startup",
        topics: ["Demand", "MVP", "Risk"]
      })
    );

    expect(agendaResponse.status).toBe(403);
    expect(roundtableResponse.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a validated Quick Brief and bounded diagnostics", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(ideaFrameFixture))
      .mockResolvedValueOnce(reply(ideaBriefFixture));
    vi.stubGlobal("fetch", fetchMock);

    const response = await quickBriefRoute(request(validRequest));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      brief: { schemaVersion: "2.0", mode: "quick" },
      budget: { maxCallAttempts: 4, usedCallAttempts: 2 },
      diagnostics: { modelCallCount: 2 }
    });
  });
});
