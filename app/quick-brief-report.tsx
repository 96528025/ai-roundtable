import type { QuickBriefDisplayResult, VerdictDecision } from "@/lib/v2/types";

const verdictLabels: Record<VerdictDecision, string> = {
  proceed_to_mvp: "Proceed to a narrow MVP",
  validate_before_building: "Validate before building",
  personal_or_portfolio: "Best as a personal or portfolio project",
  do_not_prioritize: "Do not prioritize yet",
  insufficient_evidence: "Insufficient evidence"
};

function ListCard({ title, items }: { title: string; items: string[] }) {
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

export function QuickBriefReport({
  result,
  idea,
  source,
  onPrepareFull
}: {
  result: QuickBriefDisplayResult;
  idea: string;
  source: "live" | "sample";
  onPrepareFull?: () => void;
}) {
  const { brief } = result;

  return (
    <section className="results" aria-label="Quick Brief result">
      <div className="meetingContext">
        {source === "sample" ? <span>Illustrative sample · no model call</span> : null}
        <span>Quick Brief</span>
        <span>{brief.evidence.status.replaceAll("_", " ")}</span>
        <span>{brief.verdict.confidence} confidence</span>
        {result.diagnostics ? (
          <span>{result.diagnostics.modelCallCount} observed call attempts</span>
        ) : null}
      </div>

      <section className="ideaContext" aria-label="Idea under review">
        <span>Idea under review</span>
        <p>{idea}</p>
      </section>

      <section className="summaryHero verdictHero">
        <span>Initial verdict</span>
        <h2>{verdictLabels[brief.verdict.decision]}</h2>
        <p>{brief.verdict.rationale}</p>
        <div className="verdictFlags">
          {brief.verdict.flags.map((flag) => (
            <span key={flag}>{flag.replaceAll("_", " ")}</span>
          ))}
        </div>
      </section>

      <div className="summaryGrid">
        <section className="card">
          <h3>Idea Summary</h3>
          <p>{brief.ideaSummary}</p>
        </section>
        <section className="card">
          <h3>Target User and Problem</h3>
          <p><strong>User:</strong> {brief.targetUserAndProblem.targetUser}</p>
          <p><strong>Problem:</strong> {brief.targetUserAndProblem.problem}</p>
          <p><strong>Current workaround:</strong> {brief.targetUserAndProblem.currentWorkaround}</p>
          <p className="evidenceBasis">
            Basis: {brief.targetUserAndProblem.evidenceBasis.replaceAll("_", " ")}
          </p>
        </section>

        <section className="card evidenceCard">
          <h3>Existing Alternatives</h3>
          <p className="evidenceNotice">
            External research was not run. These are user-provided or explicitly labeled
            hypotheses, not verified competitor findings.
          </p>
          {brief.existingAlternatives.items.length > 0 ? (
            <ul>
              {brief.existingAlternatives.items.map((alternative) => (
                <li key={`${alternative.name}-${alternative.category}`}>
                  <strong>{alternative.name}</strong> — {alternative.relevance}{" "}
                  <em>({alternative.basis.replaceAll("_", " ")})</em>
                </li>
              ))}
            </ul>
          ) : (
            <p>No alternative is presented as verified.</p>
          )}
          <h4>Research next</h4>
          <ul>
            {brief.existingAlternatives.researchTargets.map((target) => (
              <li key={target}>{target}</li>
            ))}
          </ul>
        </section>

        <ListCard
          title="Differentiation Opportunities"
          items={brief.differentiationOpportunities}
        />

        <section className="card wideCard">
          <h3>Recommended MVP</h3>
          <p><strong>Promise:</strong> {brief.recommendedMvp.productPromise}</p>
          <div className="splitLists">
            <div>
              <h4>Must have</h4>
              <ul>
                {brief.recommendedMvp.mustHave.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <h4>Not now</h4>
              <ul>
                {brief.recommendedMvp.notNow.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
          <p><strong>Success signal:</strong> {brief.recommendedMvp.successSignal}</p>
        </section>

        <section className="card">
          <h3>Web / PWA / App Recommendation</h3>
          <p className="largeChoice">
            {brief.platformRecommendation.choice.replaceAll("_", " ")}
          </p>
          <p>{brief.platformRecommendation.rationale}</p>
        </section>

        <section className="card">
          <h3>Suggested Technical Approach</h3>
          <p>{brief.technicalApproach.architecture}</p>
          <p><strong>Complexity:</strong> {brief.technicalApproach.complexity}</p>
          {brief.technicalApproach.externalDependencies.length > 0 ? (
            <p>
              <strong>Dependencies:</strong>{" "}
              {brief.technicalApproach.externalDependencies.join(", ")}
            </p>
          ) : null}
          <ul>
            {brief.technicalApproach.keyUnknowns.map((unknown) => (
              <li key={unknown}>{unknown}</li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3>Distribution</h3>
          <p><strong>First users:</strong> {brief.distribution.firstUsers}</p>
          <p><strong>Channels:</strong> {brief.distribution.channels.join(", ")}</p>
          <p><strong>Activation:</strong> {brief.distribution.activationMoment}</p>
        </section>

        <section className="card">
          <h3>Monetization Reality Check</h3>
          <p className="largeChoice">{brief.monetization.outlook.replaceAll("_", " ")}</p>
          <p>{brief.monetization.rationale}</p>
          <p><strong>Test:</strong> {brief.monetization.validation}</p>
        </section>

        <section className="card wideCard">
          <h3>Biggest Risks and Assumptions</h3>
          <div className="riskList">
            {brief.biggestRisksAndAssumptions.map((risk, index) => (
              <article key={`${risk.type}-${index}`}>
                <span>{risk.type}</span>
                <strong>{risk.risk}</strong>
                <p><strong>Assumption:</strong> {risk.assumption}</p>
                <p><strong>Cheapest test:</strong> {risk.cheapestTest}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="card wideCard">
          <h3>7-Day Validation Plan</h3>
          <div className="validationPlan">
            {brief.validationPlan7Days.map((step, index) => (
              <article key={`${step.days}-${index}`}>
                <span>{step.days}</span>
                <div>
                  <strong>{step.action}</strong>
                  <p><strong>Collect:</strong> {step.evidenceToCollect}</p>
                  <p><strong>Decision threshold:</strong> {step.decisionThreshold}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="card questionCard wideCard">
          <h3>One High-Impact Follow-up Question</h3>
          <p className="followUpQuestion">{brief.followUpQuestion.question}</p>
          <p><strong>Why it matters:</strong> {brief.followUpQuestion.whyItMatters}</p>
          <p><strong>What it may change:</strong> {brief.followUpQuestion.answerCouldChange}</p>
        </section>
      </div>

      <details className="transcript evidenceDetails">
        <summary>Show Evidence Boundaries and Planner Frame</summary>
        <div className="transcriptList">
          <article className="transcriptEntry">
            <div><strong>Evidence status</strong></div>
            <p>
              No external research was performed. The brief may contain user input,
              assumptions, and explicitly labeled inference only.
            </p>
          </article>
          {brief.evidence.unansweredQuestions.map((question) => (
            <article className="transcriptEntry" key={question}>
              <div><span>Unanswered</span></div>
              <p>{question}</p>
            </article>
          ))}
          {result.frame.unknowns.map((unknown) => (
            <article className="transcriptEntry" key={unknown.question}>
              <div>
                <span>{unknown.impact} impact</span>
                <strong>{unknown.answerableBy}</strong>
              </div>
              <p>{unknown.question}</p>
            </article>
          ))}
        </div>
      </details>

      {result.route.fullRoundtableRecommended && onPrepareFull ? (
        <section className="deeperAnalysis">
          <div>
            <h3>Deeper analysis may change this verdict</h3>
            <p>
              The planner found material risk, research gaps, or tradeoffs. Full Roundtable
              remains optional and model-intensive.
            </p>
          </div>
          <button className="secondaryButton" type="button" onClick={onPrepareFull}>
            Prepare Full Roundtable
          </button>
        </section>
      ) : null}

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
              <dt>Call attempts</dt>
              <dd>
                {result.diagnostics.successfulModelCalls} succeeded ·{" "}
                {result.diagnostics.failedModelCalls} failed
              </dd>
            </div>
            <div>
              <dt>Budget</dt>
              <dd>
                {result.budget?.usedCallAttempts ?? "Unavailable"} /{" "}
                {result.budget?.maxCallAttempts ?? "Unavailable"} attempts used
              </dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{result.diagnostics.models.join(", ") || "Unavailable"}</dd>
            </div>
            <div>
              <dt>Tokens</dt>
              <dd>
                {result.diagnostics.inputTokens ?? "Unavailable"} input ·{" "}
                {result.diagnostics.outputTokens ?? "Unavailable"} output
              </dd>
            </div>
          </dl>
          <p>Diagnostics exclude the idea, prompts, planner frame, and brief content.</p>
        </details>
      ) : null}
    </section>
  );
}
