"use client";

import { FormEvent, useState } from "react";
import { demoIdea, demoResult } from "@/lib/demo";
import {
  IDEA_MAX_CHARACTERS,
  IDEA_MIN_CHARACTERS,
  TOPIC_MAX_CHARACTERS
} from "@/lib/limits";
import type { PanelMode, RoundtableResult } from "@/types";

const examples = [
  "An AI workspace that helps independent consultants turn client calls into scoped proposals and follow-up tasks.",
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
  const [panelMode, setPanelMode] = useState<PanelMode>("startup");
  const [agenda, setAgenda] = useState<string[] | null>(null);
  const [result, setResult] = useState<RoundtableResult | null>(null);
  const [error, setError] = useState("");
  const [isPreparing, setIsPreparing] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [resultSource, setResultSource] = useState<"live" | "sample" | null>(null);

  function resetDownstream() {
    setAgenda(null);
    setResult(null);
    setResultSource(null);
    setError("");
  }

  function chooseExample(example: string) {
    setIdea(example);
    resetDownstream();
  }

  function choosePanel(nextPanel: PanelMode) {
    setPanelMode(nextPanel);
    resetDownstream();
  }

  function viewSampleBrief() {
    setIdea(demoIdea);
    setPanelMode(demoResult.panelMode);
    setAgenda(null);
    setResult(demoResult);
    setResultSource("sample");
    setError("");
  }

  async function prepareAgenda(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setResultSource(null);
    setIsPreparing(true);

    try {
      const response = await fetch("/api/agenda", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea, panelMode })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "The agenda could not be prepared.");
      }

      setIdea(data.idea);
      setAgenda(data.topics);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unexpected error.");
    } finally {
      setIsPreparing(false);
    }
  }

  function updateTopic(index: number, value: string) {
    setResult(null);
    setResultSource(null);
    setAgenda((current) =>
      current?.map((topic, topicIndex) => (topicIndex === index ? value : topic)) ?? null
    );
  }

  function removeTopic(index: number) {
    setResult(null);
    setResultSource(null);
    setAgenda((current) => {
      if (!current || current.length <= 3) return current;
      return current.filter((_, topicIndex) => topicIndex !== index);
    });
  }

  function addTopic() {
    setResult(null);
    setResultSource(null);
    setAgenda((current) => {
      if (!current || current.length >= 5) return current;
      return [...current, ""];
    });
  }

  async function conveneRoundtable() {
    if (!agenda) return;

    setError("");
    setResult(null);
    setIsRunning(true);

    try {
      const response = await fetch("/api/roundtable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea, panelMode, topics: agenda })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "The roundtable could not finish.");
      }

      setResult(data as RoundtableResult);
      setResultSource("live");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unexpected error.");
    } finally {
      setIsRunning(false);
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

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Human-approved multi-agent deliberation</p>
        <h1>AI Roundtable</h1>
        <p className="subtitle">
          Turn one idea into a structured debate, then approve what the council should examine
          before the agents begin.
        </p>
      </section>

      {publicDemoOnly ? (
        <section className="inputPanel publicDemoPanel" aria-labelledby="public-demo-title">
          <div className="stepLabel">Public portfolio demo</div>
          <h2 id="public-demo-title">Explore a complete decision brief instantly</h2>
          <p>
            This deployment uses a pre-generated result so reviewers can inspect the complete
            workflow without consuming model credits. Live multi-agent execution is disabled to
            protect credentials and prevent unbounded API spend.
          </p>
          <ul>
            <li>Human-approved agenda and five specialist perspectives</li>
            <li>Complete 15-turn discussion with preserved disagreements</li>
            <li>Decision brief and privacy-safe run diagnostics</li>
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
              Explore sample brief
            </button>
          </div>
        </section>
      ) : (
      <form className="inputPanel" onSubmit={prepareAgenda}>
        <div className="stepLabel">Step 1</div>
        <h2>Frame the decision</h2>

        <fieldset className="panelPicker">
          <legend>Choose an advisory panel</legend>
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

        <label htmlFor="idea">Idea or decision</label>
        <textarea
          id="idea"
          value={idea}
          onChange={(event) => {
            setIdea(event.target.value.slice(0, IDEA_MAX_CHARACTERS));
            resetDownstream();
          }}
          placeholder="Describe what you are considering, who it is for, and what is still uncertain..."
          rows={7}
          maxLength={IDEA_MAX_CHARACTERS}
        />
        <div className="characterCount" aria-live="polite">
          <span>Maximum {IDEA_MAX_CHARACTERS.toLocaleString("en-US")} characters</span>
          <span>
            {idea.length.toLocaleString("en-US")} / {IDEA_MAX_CHARACTERS.toLocaleString("en-US")}
          </span>
        </div>
        <div className="exampleRow" aria-label="Example ideas">
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => chooseExample(example)}>
              {example}
            </button>
          ))}
        </div>
        <div className="actionRow">
          <button className="secondaryButton" type="button" onClick={viewSampleBrief}>
            View sample brief
          </button>
          <button
            className="primaryButton"
            type="submit"
            disabled={
              isPreparing ||
              isRunning ||
              idea.trim().length < IDEA_MIN_CHARACTERS ||
              idea.trim().length > IDEA_MAX_CHARACTERS
            }
          >
            {isPreparing ? "Preparing agenda..." : agenda ? "Regenerate agenda" : "Prepare agenda"}
          </button>
        </div>
      </form>
      )}

      {agenda ? (
        <section className="agendaPanel" aria-labelledby="agenda-title">
          <div className="agendaHeader">
            <div>
              <div className="stepLabel">Step 2</div>
              <h2 id="agenda-title">Review and approve the agenda</h2>
              <p>
                The agents will only discuss the topics you approve. Edit the wording, remove a
                low-value topic, or add one before starting the model-intensive workflow.
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
              disabled={!agendaIsValid || isRunning}
            >
              {isRunning ? "Council in session..." : "Approve and convene"}
            </button>
          </div>
        </section>
      ) : null}

      {isRunning ? (
        <section className="processPanel" aria-live="polite">
          <div className="stepLabel">Step 3</div>
          <h2>The council is working through your approved agenda</h2>
          <p>
            Five specialist agents complete three rounds of deliberation before the moderator
            produces the decision brief. Keep this page open while the workflow runs.
          </p>
          <div className="processSteps">
            <span>Initial positions</span>
            <span>Cross-response</span>
            <span>Final recommendations</span>
            <span>Moderator synthesis</span>
          </div>
        </section>
      ) : null}

      {error ? <p className="error" role="alert">{error}</p> : null}

      {result ? (
        <section className="results">
          <div className="meetingContext">
            {resultSource === "sample" ? <span>Illustrative sample · no model call</span> : null}
            <span>{panelName(result.panelMode)}</span>
            <span>{result.agenda.length} approved topics</span>
            <span>{result.transcript.length} agent turns</span>
            {result.diagnostics ? (
              <span>{result.diagnostics.modelCallCount} observed model calls</span>
            ) : null}
            {result.diagnostics?.retryCount ? (
              <span>{result.diagnostics.retryCount} retries</span>
            ) : null}
          </div>
          <section className="summaryHero">
            <span>Executive Summary</span>
            <p>{result.summary.executiveSummary}</p>
          </section>

          <div className="summaryGrid">
            <SummaryList title="Consensus" items={result.summary.consensus} />
            <SummaryList title="Key Disagreements" items={result.summary.disagreements} />
            <SummaryList title="Biggest Risks" items={result.summary.risks} />
            <section className="card">
              <h3>Recommended Next Step</h3>
              <p>{result.summary.recommendedNextStep}</p>
            </section>
            <section className="card questionCard">
              <h3>One Follow-up Question</h3>
              <p>{result.summary.followUpQuestion}</p>
            </section>
          </div>

          <details className="transcript">
            <summary>Show Internal Debate</summary>
            <div className="transcriptList">
              {result.transcript.map((entry, index) => (
                <article key={`${entry.round}-${entry.agentName}-${index}`} className="transcriptEntry">
                  <div>
                    <span>Round {entry.round}</span>
                    <strong>{entry.agentName}</strong>
                  </div>
                  <p>{entry.content}</p>
                </article>
              ))}
            </div>
          </details>

          {result.diagnostics ? (
            <details className="diagnostics">
              <summary>Show Run Diagnostics</summary>
              <dl>
                <div>
                  <dt>Run ID</dt>
                  <dd>{result.diagnostics.runId}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{(result.diagnostics.durationMs / 1000).toFixed(1)} seconds</dd>
                </div>
                <div>
                  <dt>Model calls</dt>
                  <dd>
                    {result.diagnostics.successfulModelCalls} succeeded · {result.diagnostics.failedModelCalls} failed · {result.diagnostics.retryCount} retries
                  </dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{result.diagnostics.models.join(", ") || "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Tokens</dt>
                  <dd>
                    {result.diagnostics.inputTokens ?? "Unavailable"} input · {result.diagnostics.outputTokens ?? "Unavailable"} output
                  </dd>
                </div>
              </dl>
              <p>Diagnostics exclude the idea, prompts, and transcript content.</p>
            </details>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
