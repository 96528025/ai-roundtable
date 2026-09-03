"use client";

import { FormEvent, useEffect, useRef, useState, type RefObject } from "react";
import { QuickBriefReport } from "@/app/quick-brief-report";
import { RequestErrorNotice } from "@/app/quick-brief-error";
import { ResultErrorBoundary } from "@/app/result-error-boundary";
import {
  QUICK_BRIEF_FALLBACK_MESSAGE,
  ROUNDTABLE_FALLBACK_MESSAGE,
  buildQuickBriefRequest,
  requestAgenda,
  requestQuickBrief,
  requestRoundtable,
  type ClientError
} from "@/lib/api-client";
import { demoIdea } from "@/lib/demo";
import { demoQuickResult } from "@/lib/v2/demo";
import {
  IDEA_MAX_CHARACTERS,
  IDEA_MIN_CHARACTERS,
  TOPIC_MAX_CHARACTERS
} from "@/lib/limits";
import type { QuickBriefDisplayResult } from "@/lib/v2/types";
import type { PanelMode, RoundtableResult } from "@/types";

const examples = [
  demoIdea,
  "A marketplace where local chefs sell weekly meal subscriptions to nearby families.",
  "A browser extension that turns messy shopping tabs into a single decision brief."
];

const publicDemoOnly = process.env.NEXT_PUBLIC_DEMO_MODE === "sample";

const panelOptions: Array<{
  value: PanelMode;
  title: string;
  description: string;
}> = [
  {
    value: "startup",
    title: "Startup Validation",
    description: "Customer, product, GTM, operations, and financial perspectives."
  },
  {
    value: "general",
    title: "General Advisory",
    description: "Consumer, emotional, practical, product, and adversarial perspectives."
  }
];

type FailureSource = "quick" | "agenda" | "roundtable";

type Failure = {
  error: ClientError;
  /** Which request failed, so "Try again" re-runs the right one with current inputs. */
  source: FailureSource;
};

/** Where focus should move after the next commit. Cleared once applied. */
type FocusTarget = "status" | "result" | "error";

/**
 * One in-flight request per workflow. The controller stored in the ref is the
 * request's identity: after every `await`, a continuation compares itself to
 * the ref before touching any state, so a superseded or cancelled request can
 * never write loading, result, failure, or focus state.
 */
type RequestRef = RefObject<AbortController | null>;

function beginRequest(ref: RequestRef): AbortController {
  const controller = new AbortController();
  ref.current = controller;
  return controller;
}

/** Invalidate first, then abort, so the continuation already sees itself as stale. */
function cancelRequest(ref: RequestRef): boolean {
  const pending = ref.current;
  if (!pending) return false;
  ref.current = null;
  pending.abort();
  return true;
}

function SummaryList({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="card">
      <h3>{title}</h3>
      <ul>
        {items.map((item, index) => (
          <li key={`${title}-${index}`}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

function panelName(panelMode: PanelMode): string {
  return panelMode === "startup" ? "Startup Validation" : "General Advisory";
}

export default function Home() {
  const [idea, setIdea] = useState("");
  const [goal, setGoal] = useState("");
  const [constraintsText, setConstraintsText] = useState("");
  const [panelMode, setPanelMode] = useState<PanelMode>("startup");
  const [agenda, setAgenda] = useState<string[] | null>(null);
  const [quickResult, setQuickResult] = useState<QuickBriefDisplayResult | null>(null);
  const [quickResultSource, setQuickResultSource] = useState<"live" | "sample" | null>(null);
  const [roundtableResult, setRoundtableResult] = useState<RoundtableResult | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [isRunningQuick, setIsRunningQuick] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isRunningRoundtable, setIsRunningRoundtable] = useState(false);
  const [pendingFocus, setPendingFocus] = useState<FocusTarget | null>(null);
  // Kept per result surface so recovering one boundary cannot remount another.
  // The Quick epoch also permits re-showing the same sample object after a fault.
  const [quickResultEpoch, setQuickResultEpoch] = useState(0);
  const [roundtableResultEpoch, setRoundtableResultEpoch] = useState(0);
  // Set from an effect, so it is present only once React has hydrated the page.
  const [hydrated, setHydrated] = useState(false);

  const quickRequestRef = useRef<AbortController | null>(null);
  const agendaRequestRef = useRef<AbortController | null>(null);
  const roundtableRequestRef = useRef<AbortController | null>(null);
  const statusRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingFocus) return;
    const target =
      pendingFocus === "status"
        ? statusRef.current
        : pendingFocus === "result"
          ? resultRef.current
          : errorRef.current;
    // A result boundary may still be showing its fallback during this commit.
    // Keep the request pending until the intended target actually mounts; a
    // new result epoch reruns this effect after the boundary is replaced.
    if (!target) return;
    target.focus();
    setPendingFocus(null);
  }, [pendingFocus, quickResultEpoch]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const refs = [quickRequestRef, agendaRequestRef, roundtableRequestRef];
    return () => {
      // Invalidate every identity before aborting so no continuation updates
      // state after unmount.
      const pending = refs.map((ref) => {
        const controller = ref.current;
        ref.current = null;
        return controller;
      });
      pending.forEach((controller) => controller?.abort());
    };
  }, []);

  /** Synchronous guard: at most one workflow runs at a time, even within one tick. */
  function requestInFlight(): boolean {
    return Boolean(
      quickRequestRef.current || agendaRequestRef.current || roundtableRequestRef.current
    );
  }

  function cancelQuickBrief() {
    if (cancelRequest(quickRequestRef)) setIsRunningQuick(false);
  }

  function cancelAgenda() {
    if (cancelRequest(agendaRequestRef)) setIsPreparing(false);
  }

  function cancelRoundtable() {
    if (cancelRequest(roundtableRequestRef)) setIsRunningRoundtable(false);
  }

  function cancelAllRequests() {
    cancelQuickBrief();
    cancelAgenda();
    cancelRoundtable();
  }

  /** A roundtable error describes the previous agenda; editing the agenda retires it. */
  function clearRoundtableFailure() {
    setFailure((current) => (current?.source === "roundtable" ? null : current));
  }

  function resetAllResults() {
    cancelAllRequests();
    setAgenda(null);
    setQuickResult(null);
    setQuickResultSource(null);
    setRoundtableResult(null);
    setFailure(null);
    setPendingFocus(null);
  }

  function chooseExample(example: string) {
    setIdea(example);
    setGoal("");
    setConstraintsText("");
    resetAllResults();
  }

  function choosePanel(nextPanel: PanelMode) {
    if (nextPanel === panelMode) return;
    setPanelMode(nextPanel);
    // The panel only shapes Full Roundtable work; a pending Quick Brief stays valid.
    cancelAgenda();
    cancelRoundtable();
    setAgenda(null);
    setRoundtableResult(null);
    setFailure(null);
  }

  function viewSampleBrief() {
    cancelAllRequests();
    setIdea(demoIdea);
    setGoal("Decide whether this should become a product or remain a personal tool.");
    setConstraintsText("Reduce screen time\nDo not compromise application-tracker accuracy");
    setAgenda(null);
    setRoundtableResult(null);
    setQuickResult(demoQuickResult);
    setQuickResultSource("sample");
    setFailure(null);
    setQuickResultEpoch((epoch) => epoch + 1);
    setPendingFocus("result");
  }

  async function submitQuickBrief() {
    if (requestInFlight()) return;

    const controller = beginRequest(quickRequestRef);
    setFailure(null);
    setAgenda(null);
    setRoundtableResult(null);
    setQuickResult(null);
    setQuickResultSource(null);
    setIsRunningQuick(true);
    setPendingFocus("status");

    const outcome = await requestQuickBrief(
      buildQuickBriefRequest(idea, goal, constraintsText),
      controller.signal
    );

    // Cancelled or superseded while waiting: leave the current UI untouched.
    if (quickRequestRef.current !== controller) return;
    quickRequestRef.current = null;
    setIsRunningQuick(false);

    if (outcome.status === "success") {
      setQuickResult(outcome.data);
      setQuickResultSource("live");
      setQuickResultEpoch((epoch) => epoch + 1);
      setPendingFocus("result");
    } else if (outcome.status === "error") {
      setFailure({ error: outcome.error, source: "quick" });
      setPendingFocus("error");
    }
  }

  function handleQuickBriefSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitQuickBrief();
  }

  async function prepareFullAgenda() {
    if (requestInFlight()) return;

    const controller = beginRequest(agendaRequestRef);
    setPendingFocus(null);
    setFailure(null);
    setAgenda(null);
    setRoundtableResult(null);
    setIsPreparing(true);

    const outcome = await requestAgenda({ idea, panelMode }, controller.signal);

    // Cancelled or superseded while waiting: leave the current UI untouched.
    if (agendaRequestRef.current !== controller) return;
    agendaRequestRef.current = null;
    setIsPreparing(false);

    if (outcome.status === "success") {
      setIdea(outcome.data.idea);
      setAgenda(outcome.data.topics);
    } else if (outcome.status === "error") {
      setFailure({ error: outcome.error, source: "agenda" });
      setPendingFocus("error");
    }
  }

  function updateTopic(index: number, value: string) {
    cancelRoundtable();
    clearRoundtableFailure();
    setRoundtableResult(null);
    setAgenda((current) =>
      current?.map((topic, topicIndex) => (topicIndex === index ? value : topic)) ?? null
    );
  }

  function removeTopic(index: number) {
    cancelRoundtable();
    clearRoundtableFailure();
    setRoundtableResult(null);
    setAgenda((current) => {
      if (!current || current.length <= 3) return current;
      return current.filter((_, topicIndex) => topicIndex !== index);
    });
  }

  function addTopic() {
    cancelRoundtable();
    clearRoundtableFailure();
    setRoundtableResult(null);
    setAgenda((current) => {
      if (!current || current.length >= 5) return current;
      return [...current, ""];
    });
  }

  async function conveneRoundtable() {
    if (!agenda || requestInFlight()) return;

    const controller = beginRequest(roundtableRequestRef);
    setPendingFocus(null);
    setFailure(null);
    setRoundtableResult(null);
    setIsRunningRoundtable(true);

    const outcome = await requestRoundtable(
      { idea, panelMode, topics: agenda },
      controller.signal
    );

    // Cancelled or superseded while waiting: leave the current UI untouched.
    if (roundtableRequestRef.current !== controller) return;
    roundtableRequestRef.current = null;
    setIsRunningRoundtable(false);

    if (outcome.status === "success") {
      setRoundtableResult(outcome.data);
      setRoundtableResultEpoch((epoch) => epoch + 1);
    } else if (outcome.status === "error") {
      setFailure({ error: outcome.error, source: "roundtable" });
      setPendingFocus("error");
    }
  }

  function retryFailedRequest() {
    if (!failure) return;
    if (failure.source === "quick") {
      void submitQuickBrief();
    } else if (failure.source === "agenda") {
      void prepareFullAgenda();
    } else {
      void conveneRoundtable();
    }
  }

  const agendaIsValid =
    agenda !== null &&
    agenda.length >= 3 &&
    agenda.length <= 5 &&
    agenda.every(
      (topic) =>
        topic.trim().length > 0 && topic.trim().length <= TOPIC_MAX_CHARACTERS
    );
  const ideaIsValid =
    idea.trim().length >= IDEA_MIN_CHARACTERS &&
    idea.trim().length <= IDEA_MAX_CHARACTERS;
  const isBusy = isRunningQuick || isPreparing || isRunningRoundtable;

  return (
    <main className="shell" data-hydrated={hydrated ? "true" : undefined}>
      <section className="hero">
        <p className="eyebrow">Evidence-aware pre-build decisions</p>
        <h1>AI Roundtable</h1>
        <p className="subtitle">
          Describe an idea once. Get a concise verdict, MVP recommendation, technical
          direction, and seven-day validation plan before committing to a build.
        </p>
      </section>

      {publicDemoOnly ? (
        <section className="inputPanel publicDemoPanel" aria-labelledby="public-demo-title">
          <div className="stepLabel">Public sample demo</div>
          <h2 id="public-demo-title">Review a sample pre-build decision</h2>
          <p>
            This deployment is sample-only. It uses a pre-generated Quick Brief so the full
            product experience can be inspected without credentials, model calls, or API spend.
          </p>
          <div className="sampleIdeaPreview">
            <span>Sample idea</span>
            <p>{demoIdea}</p>
          </div>
          <ul>
            <li>An honest verdict that can recommend validation before implementation</li>
            <li>Explicit evidence boundaries instead of invented competitor claims</li>
            <li>A narrow MVP, technical direction, and measurable seven-day plan</li>
          </ul>
          <div className="actionRow publicDemoActions">
            <a
              className="secondaryButton demoLinkButton"
              href="https://github.com/96528025/ai-roundtable"
              target="_blank"
              rel="noreferrer"
            >
              View source and evaluation
            </a>
            <button className="primaryButton" type="button" onClick={viewSampleBrief}>
              Review sample Quick Brief
            </button>
          </div>
        </section>
      ) : (
        <form className="inputPanel" onSubmit={handleQuickBriefSubmit}>
          <div className="stepLabel">Quick Brief · default</div>
          <h2>Frame the idea once</h2>

          <label htmlFor="idea">Product idea</label>
          <textarea
            id="idea"
            value={idea}
            onChange={(event) => {
              setIdea(event.target.value.slice(0, IDEA_MAX_CHARACTERS));
              resetAllResults();
            }}
            placeholder="Describe the idea, who it is for, the problem, and what is still uncertain..."
            rows={7}
            maxLength={IDEA_MAX_CHARACTERS}
          />
          <div className="characterCount" aria-live="polite">
            <span>Maximum {IDEA_MAX_CHARACTERS.toLocaleString("en-US")} characters</span>
            <span>
              {idea.length.toLocaleString("en-US")} /{" "}
              {IDEA_MAX_CHARACTERS.toLocaleString("en-US")}
            </span>
          </div>

          <div className="contextFields">
            <div>
              <label htmlFor="goal">Decision goal <span>(optional)</span></label>
              <input
                id="goal"
                value={goal}
                maxLength={1000}
                onChange={(event) => {
                  setGoal(event.target.value);
                  resetAllResults();
                }}
                placeholder="Example: Decide whether to build, validate, or drop it."
              />
            </div>
            <div>
              <label htmlFor="constraints">Constraints <span>(optional, one per line)</span></label>
              <textarea
                className="compactTextarea"
                id="constraints"
                value={constraintsText}
                maxLength={1500}
                rows={3}
                onChange={(event) => {
                  setConstraintsText(event.target.value);
                  resetAllResults();
                }}
                placeholder="One week to prototype&#10;Must work on mobile"
              />
            </div>
          </div>

          <div className="exampleRow" role="group" aria-label="Example ideas">
            {examples.map((example) => (
              <button key={example} type="button" onClick={() => chooseExample(example)}>
                {example}
              </button>
            ))}
          </div>

          <details className="advancedOptions">
            <summary>Optional Full Roundtable settings</summary>
            <p>
              Full Roundtable is a slower, model-intensive legacy workflow. Use it only when
              important disagreement may change the decision.
            </p>
            <fieldset className="panelPicker">
              <legend>Advisory panel</legend>
              <div className="panelOptions">
                {panelOptions.map((option) => (
                  <button
                    className={`panelOption ${panelMode === option.value ? "selected" : ""}`}
                    key={option.value}
                    type="button"
                    onClick={() => choosePanel(option.value)}
                    aria-pressed={panelMode === option.value}
                  >
                    <strong>{option.title}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          </details>

          <div className="actionRow">
            <button className="secondaryButton" type="button" onClick={viewSampleBrief}>
              View sample
            </button>
            <button
              className="secondaryButton"
              type="button"
              disabled={!ideaIsValid || isBusy}
              onClick={prepareFullAgenda}
            >
              {isPreparing ? "Preparing Full agenda..." : "Prepare Full Roundtable"}
            </button>
            <button className="primaryButton" type="submit" disabled={!ideaIsValid || isBusy}>
              {isRunningQuick ? "Creating Quick Brief..." : "Create Quick Brief"}
            </button>
          </div>
        </form>
      )}

      {isRunningQuick ? (
        <section
          className="processPanel"
          role="status"
          aria-labelledby="quick-brief-progress-title"
          tabIndex={-1}
          ref={statusRef}
        >
          <div className="stepLabel">Quick Brief</div>
          <h2 id="quick-brief-progress-title">Turning the idea into a pre-build decision</h2>
          <p>
            The Planner is extracting assumptions and unknowns before a bounded brief writer
            produces the verdict. External research is not run in this milestone.
          </p>
          <div className="processSteps quickProcessSteps">
            <span>Frame the problem</span>
            <span>Identify unknowns</span>
            <span>Write and validate brief</span>
          </div>
        </section>
      ) : null}

      {failure ? (
        <RequestErrorNotice ref={errorRef} error={failure.error} onRetry={retryFailedRequest} />
      ) : null}

      {quickResult && quickResultSource ? (
        <ResultErrorBoundary key={quickResultEpoch} fallbackMessage={QUICK_BRIEF_FALLBACK_MESSAGE}>
          <QuickBriefReport
            ref={resultRef}
            result={quickResult}
            idea={idea}
            source={quickResultSource}
            onPrepareFull={
              publicDemoOnly || isBusy || !ideaIsValid ? undefined : prepareFullAgenda
            }
          />
        </ResultErrorBoundary>
      ) : null}

      {agenda ? (
        <section className="agendaPanel" aria-labelledby="agenda-title">
          <div className="agendaHeader">
            <div>
              <div className="stepLabel">Optional deep analysis</div>
              <h2 id="agenda-title">Review the Full Roundtable agenda</h2>
              <p>
                This starts the fixed five-agent, three-round baseline. Edit the scope before
                approving the model-intensive workflow.
              </p>
            </div>
            <span className="panelBadge">{panelName(panelMode)}</span>
          </div>

          <div className="agendaList">
            {agenda.map((topic, index) => (
              <div className="agendaItem" key={index}>
                <span>{index + 1}</span>
                <input
                  aria-label={`Agenda topic ${index + 1}`}
                  value={topic}
                  maxLength={TOPIC_MAX_CHARACTERS}
                  onChange={(event) => updateTopic(index, event.target.value)}
                />
                <button
                  className="iconButton"
                  type="button"
                  onClick={() => removeTopic(index)}
                  disabled={agenda.length <= 3}
                  aria-label={`Remove agenda topic ${index + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <div className="agendaActions">
            <button
              className="secondaryButton"
              type="button"
              onClick={addTopic}
              disabled={agenda.length >= 5}
            >
              Add topic
            </button>
            <button
              className="primaryButton"
              type="button"
              onClick={conveneRoundtable}
              disabled={!agendaIsValid || isRunningRoundtable}
            >
              {isRunningRoundtable ? "Council in session..." : "Approve and convene"}
            </button>
          </div>
        </section>
      ) : null}

      {isRunningRoundtable ? (
        <section className="processPanel" aria-live="polite">
          <div className="stepLabel">Full Roundtable</div>
          <h2>The fixed baseline is running</h2>
          <p>
            Five specialist agents complete three sequential rounds before moderator synthesis.
            Keep this page open while the workflow runs.
          </p>
          <div className="processSteps">
            <span>Initial positions</span>
            <span>Cross-response</span>
            <span>Final recommendations</span>
            <span>Moderator synthesis</span>
          </div>
        </section>
      ) : null}

      {roundtableResult ? (
        <ResultErrorBoundary
          key={roundtableResultEpoch}
          fallbackMessage={ROUNDTABLE_FALLBACK_MESSAGE}
        >
          <section className="results" aria-label="Full Roundtable result">
            <div className="meetingContext">
              <span>Full Roundtable · fixed baseline</span>
              <span>{panelName(roundtableResult.panelMode)}</span>
              <span>{roundtableResult.agenda.length} approved topics</span>
              <span>{roundtableResult.transcript.length} agent turns</span>
              {roundtableResult.diagnostics ? (
                <span>{roundtableResult.diagnostics.modelCallCount} observed call attempts</span>
              ) : null}
            </div>
            <section className="ideaContext" aria-label="Idea under review">
              <span>Idea under review</span>
              <p>{idea}</p>
            </section>
            <section className="summaryHero">
              <span>Moderator Summary</span>
              <p>{roundtableResult.summary.executiveSummary}</p>
            </section>

            <div className="summaryGrid">
              <SummaryList title="Consensus" items={roundtableResult.summary.consensus} />
              <SummaryList
                title="Key Disagreements"
                items={roundtableResult.summary.disagreements}
              />
              <SummaryList title="Biggest Risks" items={roundtableResult.summary.risks} />
              <section className="card">
                <h3>Recommended Next Step</h3>
                <p>{roundtableResult.summary.recommendedNextStep}</p>
              </section>
              <section className="card questionCard">
                <h3>One Follow-up Question</h3>
                <p>{roundtableResult.summary.followUpQuestion}</p>
              </section>
            </div>

            <details className="transcript">
              <summary>Show Internal Debate</summary>
              <div className="transcriptList">
                {roundtableResult.transcript.map((entry, index) => (
                  <article
                    key={`${entry.round}-${entry.agentName}-${index}`}
                    className="transcriptEntry"
                  >
                    <div>
                      <span>Round {entry.round}</span>
                      <strong>{entry.agentName}</strong>
                    </div>
                    <p>{entry.content}</p>
                  </article>
                ))}
              </div>
            </details>

            {roundtableResult.diagnostics ? (
              <details className="diagnostics">
                <summary>Show Run Diagnostics</summary>
                <dl>
                  <div>
                    <dt>Run ID</dt>
                    <dd>{roundtableResult.diagnostics.runId}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{(roundtableResult.diagnostics.durationMs / 1000).toFixed(1)} seconds</dd>
                  </div>
                  <div>
                    <dt>Call attempts</dt>
                    <dd>
                      {roundtableResult.diagnostics.successfulModelCalls} succeeded ·{" "}
                      {roundtableResult.diagnostics.failedModelCalls} failed ·{" "}
                      {roundtableResult.diagnostics.retryCount} retries
                    </dd>
                  </div>
                  <div>
                    <dt>Model</dt>
                    <dd>{roundtableResult.diagnostics.models.join(", ") || "Unavailable"}</dd>
                  </div>
                  <div>
                    <dt>Tokens</dt>
                    <dd>
                      {roundtableResult.diagnostics.inputTokens ?? "Unavailable"} input ·{" "}
                      {roundtableResult.diagnostics.outputTokens ?? "Unavailable"} output
                    </dd>
                  </div>
                </dl>
                <p>Diagnostics exclude the idea, prompts, and transcript content.</p>
              </details>
            ) : null}
          </section>
        </ResultErrorBoundary>
      ) : null}
    </main>
  );
}
