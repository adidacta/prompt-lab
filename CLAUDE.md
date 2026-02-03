# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hebrew (RTL) web application that helps municipal education employees build effective AI prompts through a conversational interview flow. The app guides users through prompt construction with a chat interface and a live "Prompt Canvas" sidebar.

## Development Commands

```bash
# Install dependencies
npm install

# Run local development server (requires .env file with ANTHROPIC_API_KEY)
vercel dev

# Deploy to Vercel
vercel --prod
```

**Environment Setup:** Create `.env` file with `ANTHROPIC_API_KEY=sk-ant-...`

## Architecture

```
prompt-lab/
├── index.html      # Single-page app with chat + canvas layout
├── styles.css      # Dark theme, RTL support, chat bubbles
├── app.js          # Frontend state management and UI logic
├── api/
│   └── generate.js # Vercel serverless function (Claude API proxy)
├── vercel.json     # Vercel configuration
└── package.json    # Dependencies (@anthropic-ai/sdk)
```

### Key Components

**Frontend (app.js):**
- `state` object: Tracks conversation history, current prompt, loading state
- `SYSTEM_PROMPT`: Hebrew instructions that guide the AI to conduct an interview-style conversation, asking one question at a time with suggested answers
- AI responses must be JSON with `message`, `suggestions` array, `prompt` object, and `isComplete` flag
- Canvas updates in real-time as the AI parses prompt components (role, task, format, tone, constraints)

**API (api/generate.js):**
- Vercel serverless function using CommonJS (`module.exports`)
- Proxies requests to Anthropic Claude API
- Model: `claude-3-haiku-20240307`

### UI Flow

1. User states what they want to create
2. AI asks interview questions one at a time with clickable answer suggestions
3. Canvas sidebar shows prompt building in real-time
4. When complete, user can "Run Prompt" or "Copy to Clipboard"

## Language & RTL

- All UI text is in Hebrew
- HTML uses `dir="rtl"` and `lang="he"`
- Tailwind configured for RTL layout
