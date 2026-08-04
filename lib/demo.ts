import type { RoundtableResult } from "@/types";

export const demoIdea =
  "I spend too many hours staring at screens while tracking internship applications, and the eye strain is getting worse. I want a voice-first assistant that lets me review and update my daily application status and decide what to do next by speaking.";

export const demoResult: RoundtableResult = {
  panelMode: "startup",
  agenda: [
    "User pain and current application-tracking workflow",
    "Voice interaction and daily check-in experience",
    "Application data accuracy and confirmation",
    "Privacy, accessibility, and usage context",
    "Smallest testable MVP and validation signals"
  ],
  summary: {
    executiveSummary:
      "The strongest MVP is not an autonomous job-search agent or a voice-only replacement for every screen. It is a five-minute voice check-in that reads the current application pipeline, lets the user record status changes hands-free, asks for confirmation before writing them, and ends with a short next-action plan. Validate whether this reduces screen time without increasing tracking errors before adding job discovery, email integrations, or auto-apply.",
    consensus: [
      "The initial user should be a frequent internship applicant with screen fatigue who already maintains an application tracker.",
      "A structured tracker should remain the source of truth; voice should provide a hands-free way to review, update, and plan.",
      "Every change to a company, role, status, or deadline should be read back and explicitly confirmed before it is saved."
    ],
    disagreements: [
      "The Product Lead favors a voice-first workflow with compact visual confirmation, while the Customer Strategist wants to test how much of the experience users truly expect to complete without looking at a screen.",
      "The GTM Operator sees email and calendar integrations as a retention driver, while the Operations & Risk Lead would defer them until the core update flow is accurate and trusted."
    ],
    risks: [
      "Speech transcription could attach an update to the wrong company, role, status, or deadline.",
      "Voice interaction may be impractical in shared spaces and should not become the only accessible way to use the product.",
      "Application history contains personal job-search data and requires clear retention, export, and deletion controls."
    ],
    recommendedNextStep:
      "Within 2 weeks, run a concierge prototype with 6 internship seekers for 5 consecutive days; conduct one five-minute voice check-in per day and measure screen minutes avoided, correction rate for status updates, and how many participants return on at least 4 of 5 days.",
    followUpQuestion:
      "Which daily task creates the most avoidable screen time today: finding roles, recording applications, reviewing deadlines, or planning follow-ups?"
  },
  transcript: [
    {
      round: 1,
      agentName: "Customer Strategist",
      content:
        "The screen-fatigue problem is credible, but we should identify which daily job-search task causes it and how often it occurs. I would start with applicants who already maintain a spreadsheet or Notion tracker and review it every day."
    },
    {
      round: 1,
      agentName: "Product Lead",
      content:
        "The MVP should be a short voice check-in: read today's pipeline, capture status changes, surface deadlines, and end with three next actions. Each proposed update needs a read-back confirmation before it changes the tracker."
    },
    {
      round: 1,
      agentName: "GTM Operator",
      content:
        "Start with active internship seekers in university career clubs and online accountability groups. The first aha moment is completing a useful daily review hands-free, not importing every historical application or discovering new jobs."
    },
    {
      round: 1,
      agentName: "Operations & Risk Lead",
      content:
        "Speech recognition can confuse company names, job titles, and dates, while application histories contain personal information. The workflow needs explicit confirmation, correction, retention, and deletion controls from the first prototype."
    },
    {
      round: 1,
      agentName: "Financial Skeptic",
      content:
        "This may be a pleasant convenience rather than a durable product. The test should measure repeated use, screen minutes avoided, and correction rates before the team invests in email integrations, job discovery, or automatic applications."
    },
    {
      round: 2,
      agentName: "Customer Strategist",
      content:
        "Financial Skeptic is right that claimed time savings are not enough. Interviews should reconstruct yesterday's tracking routine and identify the exact moments when users wished they could review or record an update without opening another screen."
    },
    {
      round: 2,
      agentName: "Product Lead",
      content:
        "Operations & Risk Lead is right about confirmation. I would make the assistant say, 'Move Regala AI to interview on August 8—correct?' and keep a compact visual activity log for recovery rather than pretending voice can replace every screen."
    },
    {
      round: 2,
      agentName: "GTM Operator",
      content:
        "Product Lead has the right activation event, but the prototype should work with an existing tracker instead of creating another dashboard. A guided demo using realistic applications will communicate the benefit more clearly than a broad AI-career pitch."
    },
    {
      round: 2,
      agentName: "Operations & Risk Lead",
      content:
        "GTM Operator's integration idea may improve retention later, but connecting email and calendars expands the data surface too early. First test manual or mock tracker data, ambiguous speech, corrections, and deletion alongside the happy path."
    },
    {
      round: 2,
      agentName: "Financial Skeptic",
      content:
        "Customer Strategist proposes the right observation, but the baseline must be measurable. Compare a normal five-day tracking routine with the voice check-in and count screen minutes, missed updates, corrections, and voluntary repeat sessions."
    },
    {
      round: 3,
      agentName: "Customer Strategist",
      content:
        "After hearing Financial Skeptic, my final recommendation is a five-day concierge test with return behavior as the strongest signal. Do not count compliments; count whether applicants choose the voice check-in on at least four days."
    },
    {
      round: 3,
      agentName: "Product Lead",
      content:
        "Operations & Risk Lead changed my view on a voice-only interface. Build the smallest hybrid flow: spoken review and updates, verbal confirmation, plus a compact activity log that users can inspect when something sounds wrong."
    },
    {
      round: 3,
      agentName: "GTM Operator",
      content:
        "I accept Product Lead's narrow MVP. Recruit six internship seekers through campus communities, demonstrate one realistic daily check-in, and invite them into a five-day concierge pilot rather than advertising a complete job-search assistant."
    },
    {
      round: 3,
      agentName: "Operations & Risk Lead",
      content:
        "I agree with Customer Strategist that real routines matter, provided participants can use anonymized records and delete their data. Test one wrong company name, one wrong date, and one interrupted session so recovery is explicit."
    },
    {
      round: 3,
      agentName: "Financial Skeptic",
      content:
        "GTM Operator's narrow recruiting plan makes the test affordable. Set a two-week cap and require lower screen time, an acceptable correction rate, and at least four of six participants returning on four days before deeper integrations."
    }
  ]
};
