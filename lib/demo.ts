import type { RoundtableResult } from "@/types";

export const demoIdea =
  "An AI workspace that helps independent consultants turn client calls into scoped proposals and follow-up tasks.";

export const demoResult: RoundtableResult = {
  panelMode: "startup",
  agenda: [
    "Customer urgency and current workaround",
    "Trust in generated scope",
    "Smallest useful workflow",
    "Adoption and distribution",
    "Validation evidence"
  ],
  summary: {
    executiveSummary:
      "The concept targets a costly handoff between client conversations and approved work, but the strongest wedge is not generic meeting notes. It is a reviewable call-to-scope workflow for consultants who repeatedly lose time clarifying deliverables. Validate that narrow promise before adding project management or CRM features.",
    consensus: [
      "The initial user should be an independent consultant with repeated discovery-to-proposal work.",
      "Human review must remain visible because an incorrect scope can damage client trust.",
      "The MVP should stop at an approval-ready scope and follow-up draft rather than becoming a full operating system."
    ],
    disagreements: [
      "The Product Lead favors a document-first prototype, while the GTM Operator believes a CRM integration may be necessary to earn repeated use.",
      "The Financial Skeptic questions willingness to pay until time saved and revision reduction are measured."
    ],
    risks: [
      "A polished summary can appear useful while missing commitments that materially change price or timeline.",
      "Consultants may resist sending sensitive client conversations to a new tool.",
      "Broad integrations could delay validation of the core call-to-scope promise."
    ],
    recommendedNextStep:
      "Within 2 weeks, interview 8 independent consultants and run a concierge test on 5 completed discovery calls; measure editing time, missed commitments, and whether at least 3 participants request a second use.",
    followUpQuestion:
      "Which consulting specialty has the most frequent and expensive scope revisions after discovery calls?"
  },
  transcript: [
    {
      round: 1,
      agentName: "Customer Strategist",
      content:
        "The pain is credible when consultants repeatedly translate calls into scope, but frequency matters more than enthusiasm. I would target specialists who write several proposals each month and currently replay recordings or copy notes by hand."
    },
    {
      round: 1,
      agentName: "Product Lead",
      content:
        "The MVP should transform one call into a reviewable scope: objectives, deliverables, exclusions, assumptions, and next actions. A visible approval step is essential because silent automation would create false confidence around client commitments."
    },
    {
      round: 1,
      agentName: "GTM Operator",
      content:
        "Start with consultant communities and proposal coaches, where the workflow can be demonstrated using a before-and-after example. The first activation event is not uploading a call; it is approving a useful scope draft."
    },
    {
      round: 1,
      agentName: "Operations & Risk Lead",
      content:
        "Client recordings can contain confidential commercial information. The product needs clear retention controls, deletion behavior, and an explanation of where model processing occurs before users will trust it with real calls."
    },
    {
      round: 1,
      agentName: "Financial Skeptic",
      content:
        "Time saved is not automatically willingness to pay. The business case needs evidence that faster drafting either increases proposal volume, shortens the sales cycle, or reduces costly scope revisions after a project begins."
    },
    {
      round: 2,
      agentName: "Customer Strategist",
      content:
        "I agree with Financial Skeptic that generic time savings are weak. Interviews should uncover the last scope mistake, its consequence, and the current prevention ritual; those stories will reveal whether this is urgent or merely convenient."
    },
    {
      round: 2,
      agentName: "Product Lead",
      content:
        "GTM Operator is right that approval is the activation event, but I would defer CRM integration. A document export and explicit evidence links back to the transcript are enough to test whether consultants trust the generated scope."
    },
    {
      round: 2,
      agentName: "GTM Operator",
      content:
        "I agree with Product Lead on keeping the build narrow, yet the prototype should export into the user's existing proposal format. Distribution will be easier if the demo ends inside a familiar deliverable rather than another dashboard."
    },
    {
      round: 2,
      agentName: "Operations & Risk Lead",
      content:
        "Product Lead's evidence-link proposal also reduces trust risk because every generated commitment becomes auditable. The team should test deletion and failure handling alongside happy-path output, not postpone them until deployment."
    },
    {
      round: 2,
      agentName: "Financial Skeptic",
      content:
        "Customer Strategist proposes the right interviews, but claimed pain still needs behavioral evidence. Ask participants to submit a real completed call and compare editing time and omissions against their normal workflow."
    },
    {
      round: 3,
      agentName: "Customer Strategist",
      content:
        "After hearing Financial Skeptic, my final recommendation is a concierge test with repeat usage as the strongest signal. Do not count compliments; count whether consultants volunteer a second call after reviewing the first scope."
    },
    {
      round: 3,
      agentName: "Product Lead",
      content:
        "Operations & Risk Lead changed my view on evidence visibility. Build the smallest review screen that pairs each proposed deliverable with its source passage, then measure edits before generating a final document."
    },
    {
      round: 3,
      agentName: "GTM Operator",
      content:
        "I accept Product Lead's document-first MVP. Recruit through two niche consultant communities, run live demos using anonymized calls, and follow up with a concierge offer rather than promoting a broad AI workspace."
    },
    {
      round: 3,
      agentName: "Operations & Risk Lead",
      content:
        "I agree with Customer Strategist that real calls are necessary, provided participants consent and can delete them. Document the data lifecycle and test one model failure so the team can explain recovery honestly."
    },
    {
      round: 3,
      agentName: "Financial Skeptic",
      content:
        "GTM Operator's narrow acquisition plan makes the test affordable. Set a two-week cap and require measurable reductions in editing time plus at least three repeat-use requests before paying for deeper integrations."
    }
  ]
};
