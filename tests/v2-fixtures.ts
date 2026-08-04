import type { IdeaBrief, IdeaFrame } from "@/lib/v2/types";

export const ideaFrameFixture: IdeaFrame = {
  summary: "A browser tool that turns open shopping tabs into a decision brief.",
  targetUser: "Online shoppers comparing several complex products.",
  problem: "Comparison details are fragmented across tabs and difficult to weigh consistently.",
  desiredOutcome: "Reach a confident purchase decision with less manual comparison work.",
  currentWorkaround: "Manually switch between tabs and keep notes in a document.",
  assumptions: [
    "Shoppers experience this problem often enough to adopt a dedicated workflow."
  ],
  unknowns: [
    {
      question: "Which product category creates the most repeated comparison work?",
      impact: "high",
      answerableBy: "user",
      mayChangeVerdict: true
    }
  ],
  riskSignals: [],
  routingSignals: {
    researchNeed: "high",
    ambiguity: "medium",
    buildComplexity: "medium",
    deliberationValue: "medium"
  }
};

export const ideaBriefFixture: IdeaBrief = {
  schemaVersion: "2.0",
  mode: "quick",
  ideaSummary:
    "A browser-based comparison assistant that converts a shopper's open product tabs into a priorities-based decision brief.",
  verdict: {
    decision: "validate_before_building",
    confidence: "medium",
    rationale:
      "The workflow is plausible, but repeated demand and trust in extracted product data need evidence before a polished extension is justified.",
    flags: ["evidence_gap"]
  },
  targetUserAndProblem: {
    targetUser: "Online shoppers comparing several high-consideration products.",
    problem: "They repeatedly reconcile inconsistent details across tabs before buying.",
    currentWorkaround: "Manual tab switching, notes, spreadsheets, or ad hoc comparison tables.",
    evidenceBasis: "inference"
  },
  evidence: {
    status: "not_researched",
    sources: [],
    claims: [
      {
        id: "claim-1",
        text: "A narrow category may make extraction and comparison more trustworthy.",
        kind: "inference",
        sourceIds: [],
        confidence: "medium"
      }
    ],
    unansweredQuestions: [
      "Which product category produces frequent, consequential comparison sessions?"
    ]
  },
  existingAlternatives: {
    status: "not_researched",
    items: [
      {
        name: "Manual comparison notes",
        category: "User workaround",
        relevance: "A free, flexible baseline that the product must beat on speed and clarity.",
        basis: "inference",
        sourceIds: []
      }
    ],
    researchTargets: [
      "Browser extensions for product comparison",
      "Retailer-native comparison tools"
    ]
  },
  differentiationOpportunities: [
    "Ask for the shopper's priorities before generating the comparison.",
    "Show the source tab beside every extracted attribute and uncertainty."
  ],
  recommendedMvp: {
    productPromise: "Turn five product tabs into a traceable comparison in under two minutes.",
    mustHave: [
      "Capture the user's top three decision criteria.",
      "Extract a small set of category-specific attributes.",
      "Link each comparison value back to its source tab."
    ],
    notNow: ["Price monitoring", "Affiliate monetization", "Every shopping category"],
    successSignal:
      "At least 4 of 6 testers use the brief to make or confidently defer a real decision."
  },
  platformRecommendation: {
    choice: "web",
    rationale:
      "Validate the comparison workflow with pasted URLs before accepting extension permissions and maintenance cost."
  },
  technicalApproach: {
    architecture:
      "A small Next.js application with server-side page extraction, normalized category fields, and a structured brief generator.",
    externalDependencies: ["Page extraction service", "LLM API"],
    complexity: "medium",
    keyUnknowns: [
      "Whether target retailers expose enough stable data for reliable extraction."
    ]
  },
  distribution: {
    firstUsers: "People currently researching one narrow, high-consideration product category.",
    channels: ["Category-specific communities", "Personal user interviews"],
    activationMoment:
      "The user sees a cited comparison that resolves one previously confusing tradeoff."
  },
  monetization: {
    outlook: "unclear",
    rationale:
      "A useful one-off comparison does not yet demonstrate repeat usage or willingness to pay.",
    validation: "Ask testers to pay for a second comparison only after the first real decision."
  },
  biggestRisksAndAssumptions: [
    {
      risk: "Users may not compare products often enough to return.",
      type: "desirability",
      assumption: "The workflow recurs across multiple purchases.",
      cheapestTest: "Recruit only people with two recent comparison sessions and inspect recurrence."
    },
    {
      risk: "Incorrect extraction could make the brief less trustworthy than manual review.",
      type: "trust",
      assumption: "Important attributes can be extracted and traced reliably.",
      cheapestTest: "Manually verify every extracted value in six concierge briefs."
    }
  ],
  validationPlan7Days: [
    {
      days: "Day 1",
      action: "Choose one product category and define five comparison attributes.",
      evidenceToCollect: "Examples of real, active comparison sessions.",
      decisionThreshold: "Find at least 5 people currently comparing three or more products."
    },
    {
      days: "Days 2-4",
      action: "Create six concierge briefs from testers' real tabs.",
      evidenceToCollect: "Corrections, missing attributes, and decision changes.",
      decisionThreshold: "At least 5 of 6 briefs require no material factual correction."
    },
    {
      days: "Days 5-7",
      action: "Ask testers to use the brief and request a second comparison.",
      evidenceToCollect: "Decision completion and voluntary repeat demand.",
      decisionThreshold: "At least 4 testers act on the brief and 2 request another comparison."
    }
  ],
  followUpQuestion: {
    question: "Which single product category do you personally compare often enough to recruit six active shoppers this week?",
    whyItMatters: "Category choice determines extraction reliability, user urgency, and recruitment speed.",
    answerCouldChange:
      "It could narrow the MVP or show that the problem is too infrequent for a standalone product."
  }
};
