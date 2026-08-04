import { demoIdea } from "@/lib/demo";
import type { QuickBriefDisplayResult } from "@/lib/v2/types";

export const demoQuickResult: QuickBriefDisplayResult = {
  frame: {
    summary:
      "A voice-first assistant for reviewing and updating an internship application tracker with less screen time.",
    targetUser:
      "Frequent internship applicants who already maintain a tracker and experience screen fatigue.",
    problem:
      "Daily status review, deadline checking, and update entry require more screen time than the user wants.",
    desiredOutcome:
      "Complete a short daily application check-in by voice without reducing data accuracy.",
    currentWorkaround:
      "Open a spreadsheet or tracker, review rows manually, and type each status change.",
    assumptions: [
      "Applicants will use voice repeatedly for tracker review and updates.",
      "A confirmation step can keep voice-originated changes accurate enough to trust."
    ],
    unknowns: [
      {
        question: "Which daily tracking task creates the most avoidable screen time?",
        impact: "high",
        answerableBy: "user",
        mayChangeVerdict: true
      },
      {
        question: "Will applicants choose a voice check-in in shared or public spaces?",
        impact: "high",
        answerableBy: "research",
        mayChangeVerdict: true
      }
    ],
    riskSignals: ["sensitive_data"],
    routingSignals: {
      researchNeed: "high",
      ambiguity: "medium",
      buildComplexity: "medium",
      deliberationValue: "high"
    }
  },
  route: {
    selectedPath: "quick",
    fullRoundtableRecommended: true,
    reasonCodes: [
      "default_quick_path",
      "high_risk",
      "material_research_gap",
      "material_tradeoffs"
    ]
  },
  brief: {
    schemaVersion: "2.0",
    mode: "quick",
    ideaSummary: demoIdea,
    verdict: {
      decision: "validate_before_building",
      confidence: "medium",
      rationale:
        "The narrow daily check-in is testable and personally relevant, but the idea should not expand into integrations or autonomous job-search features until repeated voice usage and update accuracy are demonstrated.",
      flags: ["high_execution_risk", "evidence_gap"]
    },
    targetUserAndProblem: {
      targetUser:
        "Active internship applicants with screen fatigue who already maintain a structured application tracker.",
      problem:
        "Reviewing deadlines, recording status changes, and choosing the next action adds avoidable daily screen time.",
      currentWorkaround:
        "Open a spreadsheet, Notion database, or other tracker and manually inspect and edit application records.",
      evidenceBasis: "inference"
    },
    evidence: {
      status: "not_researched",
      sources: [],
      claims: [
        {
          id: "claim-1",
          text:
            "A short voice check-in may be more valuable than a voice-only replacement for the entire application workflow.",
          kind: "inference",
          sourceIds: [],
          confidence: "medium"
        }
      ],
      unansweredQuestions: [
        "How often do target users review or update a tracker each week?",
        "What correction rate would make voice updates feel unsafe?",
        "Where are users physically located during the proposed check-in?"
      ]
    },
    existingAlternatives: {
      status: "not_researched",
      items: [
        {
          name: "Manual application tracker",
          category: "Current workflow",
          relevance:
            "It is flexible, visible, and accurate enough to remain the likely source of truth.",
          basis: "inference",
          sourceIds: []
        },
        {
          name: "General-purpose voice assistant",
          category: "Adjacent workflow",
          relevance:
            "It can capture notes or reminders but may not understand structured application state.",
          basis: "inference",
          sourceIds: []
        }
      ],
      researchTargets: [
        "Current job-application trackers with voice or accessibility features",
        "Voice journaling and hands-free task-update products",
        "Open-source job-application tracking projects"
      ]
    },
    differentiationOpportunities: [
      "Focus on a five-minute daily pipeline check-in rather than broad job discovery or auto-apply.",
      "Make every proposed update reversible and require spoken or visual confirmation.",
      "Measure screen minutes avoided alongside correction rate instead of claiming generic productivity."
    ],
    recommendedMvp: {
      productPromise:
        "Review today's application pipeline, record confirmed changes, and leave with three next actions in five minutes.",
      mustHave: [
        "Read a small set of current application records.",
        "Capture one status or deadline change at a time.",
        "Read each change back before saving it.",
        "End with a concise next-action summary."
      ],
      notNow: [
        "Automatic job applications",
        "Email and calendar integrations",
        "Job discovery",
        "A voice-only interface with no recovery view"
      ],
      successSignal:
        "At least 4 of 6 participants complete the voice check-in on 4 of 5 days with no material tracker errors."
    },
    platformRecommendation: {
      choice: "no_build_yet",
      rationale:
        "A concierge test can validate repeated voice usage and confirmation behavior before choosing between a PWA and a native mobile implementation."
    },
    technicalApproach: {
      architecture:
        "For validation, use a human-operated prototype connected to sample tracker data. If the test passes, start with a small web or PWA client, server-side speech processing, structured update proposals, and an append-only activity log.",
      externalDependencies: [
        "Speech-to-text service",
        "Text-to-speech service",
        "Structured tracker storage"
      ],
      complexity: "medium",
      keyUnknowns: [
        "Recognition accuracy for company names, role titles, dates, and statuses.",
        "Whether mobile browser audio behavior is sufficient for the target workflow."
      ]
    },
    distribution: {
      firstUsers:
        "Six active internship applicants recruited from university career clubs or job-search accountability groups.",
      channels: [
        "University career communities",
        "Internship-search accountability groups",
        "Direct outreach to existing tracker users"
      ],
      activationMoment:
        "A participant completes a real daily pipeline review without opening the full tracker."
    },
    monetization: {
      outlook: "unclear",
      rationale:
        "Reduced screen time may be personally valuable without supporting a standalone subscription, especially if usage is seasonal.",
      validation:
        "First measure repeated use; only then test whether participants would pay for a month during an active application cycle."
    },
    biggestRisksAndAssumptions: [
      {
        risk: "Voice may be inconvenient in shared spaces.",
        type: "desirability",
        assumption: "Users have a private moment for a daily spoken check-in.",
        cheapestTest: "Record where and when six participants attempt each session."
      },
      {
        risk: "A transcription error could update the wrong company, status, or date.",
        type: "trust",
        assumption: "Read-back confirmation keeps material errors acceptably low.",
        cheapestTest: "Seed ambiguous names and dates into a concierge prototype and count corrections."
      },
      {
        risk: "The workflow may be too seasonal or infrequent for a business.",
        type: "viability",
        assumption: "Applicants repeat the check-in often enough to retain.",
        cheapestTest: "Measure voluntary return behavior for five consecutive days."
      }
    ],
    validationPlan7Days: [
      {
        days: "Day 1",
        action: "Recruit six applicants who already maintain an active tracker.",
        evidenceToCollect: "Their current review frequency and screen-time pain.",
        decisionThreshold: "At least four review or update the tracker on four days per week."
      },
      {
        days: "Days 2-3",
        action: "Run one human-operated voice check-in using anonymized tracker records.",
        evidenceToCollect: "Completion time, corrections, and moments requiring a screen.",
        decisionThreshold: "Five of six finish within five minutes and no material error is saved."
      },
      {
        days: "Days 4-6",
        action: "Repeat the check-in without reminders and test ambiguous names or dates.",
        evidenceToCollect: "Voluntary returns, correction rate, and recovery behavior.",
        decisionThreshold: "Four participants return on at least three of these days."
      },
      {
        days: "Day 7",
        action: "Compare the voice routine with each participant's normal tracker routine.",
        evidenceToCollect: "Screen minutes avoided, accuracy, preference, and willingness to continue.",
        decisionThreshold: "Proceed only if four prefer the voice check-in and accuracy is not worse."
      }
    ],
    followUpQuestion: {
      question:
        "Which daily task creates the most avoidable screen time today: reviewing deadlines, recording status changes, or planning follow-ups?",
      whyItMatters:
        "The answer determines the first workflow, the smallest prototype, and what improvement to measure.",
      answerCouldChange:
        "It could narrow the product to a read-only briefing, an update tool, or a planning assistant."
    }
  }
};
