# AI Roundtable

AI Roundtable is a minimal Next.js MVP for private multi-agent deliberation. A user submits an idea, five fixed persona agents debate it across three rounds, and a moderator returns a structured final report before exposing the transcript.

## Setup

```bash
npm install
```

Create `.env.local`:

```bash
ANTHROPIC_API_KEY=your_api_key_here
```

Optionally choose a Claude model:

```bash
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
```

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Project Structure

- `app/page.tsx` - main UI
- `app/api/roundtable/route.ts` - API endpoint
- `lib/agents.ts` - persona definitions
- `lib/claude.ts` - Claude API wrapper
- `lib/debate.ts` - multi-agent debate orchestration
- `lib/history.ts` - local JSON meeting history
- `types.ts` - shared TypeScript types

## Notes

- Meeting history is stored locally in `data/meetings.json`.
- There is no authentication, payment, or complex memory yet.
- The backend requires `ANTHROPIC_API_KEY`; without it, the API returns a clear setup error.
