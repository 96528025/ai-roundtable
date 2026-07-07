"use client";

import { FormEvent, useState } from "react";
import type { RoundtableResult } from "@/types";

const examples = [
  "A browser extension that turns messy shopping tabs into a single decision brief.",
  "A weekend pop-up cafe where every drink is paired with a tiny handwritten story.",
  "An app that helps students rehearse hard conversations with different mentor personas."
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

export default function Home() {
  const [idea, setIdea] = useState("");
  const [result, setResult] = useState<RoundtableResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function conveneRoundtable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/roundtable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "The roundtable could not finish.");
      }

      setResult(data as RoundtableResult);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unexpected error.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Private multi-agent deliberation</p>
        <h1>AI Roundtable</h1>
        <p className="subtitle">Let your personal advisory board debate your idea.</p>
      </section>

      <form className="inputPanel" onSubmit={conveneRoundtable}>
        <label htmlFor="idea">Idea</label>
        <textarea
          id="idea"
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          placeholder="Describe the idea you want the council to debate..."
          rows={8}
        />
        <div className="exampleRow" aria-label="Example ideas">
          {examples.map((example) => (
            <button key={example} type="button" onClick={() => setIdea(example)}>
              {example}
            </button>
          ))}
        </div>
        <div className="actionRow">
          <button className="primaryButton" type="submit" disabled={isLoading || idea.trim().length < 10}>
            {isLoading ? "The council is debating..." : "Convene Roundtable"}
          </button>
        </div>
        {error ? <p className="error">{error}</p> : null}
      </form>

      {result ? (
        <section className="results" aria-live="polite">
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
        </section>
      ) : null}
    </main>
  );
}
