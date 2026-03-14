# AcquirerData - AMMF Data Preparation

Agentic AI utility for Acquirer Merchant Master File (AMMF) preparation and compliance validation.

## Architecture

```
AcquirerData/
├── backend/          # FastAPI + DuckDB + Claude AI agents
│   ├── agents/       # 6 AI agents (schema mapper, quality analyzer, etc.)
│   ├── api/routes/   # REST endpoints
│   ├── core/         # Config, DB engine, job store, LLM client
│   └── rules/        # AMMF spec, DQ rules, 13 violation rules
└── frontend/         # Next.js 16 + React 19 + Tailwind CSS
    ├── src/app/      # Pages (upload, pipeline dashboard, reports)
    ├── src/components/ # UI components
    └── src/lib/      # API client, types, constants
```

## Deployment

| Service | Platform | URL |
|---------|----------|-----|
| Backend API | Railway | Set via `RAILWAY_PUBLIC_DOMAIN` |
| Frontend | Vercel | Set via Vercel dashboard |

### Backend (Railway)

1. Connect this repo to Railway
2. Set root directory to `backend`
3. Add environment variables:
   - `ANTHROPIC_API_KEY` - Claude API key
   - `FRONTEND_URL` - Your Vercel frontend URL

### Frontend (Vercel)

1. Connect this repo to Vercel
2. Set root directory to `frontend`
3. Add environment variable:
   - `NEXT_PUBLIC_API_URL` - Your Railway backend URL

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # Add your API key
uvicorn main:app --reload --port 8000

# Frontend
cd frontend
npm install
cp .env.example .env.local  # Set API URL
npm run dev
```

## Pipeline

8-step agentic pipeline: Upload → Schema Mapping → Completeness → Relationships → Data Quality → Query Generation → Execution → Violation Checks

## Tech Stack

- **Backend**: FastAPI, DuckDB, Anthropic Claude, Pandas
- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS 4
