# VedaAI — Assessment Extraction & Answer Mapping

A teacher uploads a **question paper** and one **student answer sheet**. The app extracts every question, reads the handwriting, maps answers back to questions, and highlights the exact region on the sheet.

**Live demo:** [https://ai-tutor-rag.vercel.app/](https://ai-tutor-rag.vercel.app/)

[![Live](https://img.shields.io/badge/demo-live-22c55e?style=flat-square)](https://ai-tutor-rag.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square)](https://nextjs.org/)
[![Express](https://img.shields.io/badge/API-Express-000000?style=flat-square)](https://expressjs.com/)
[![Gemini](https://img.shields.io/badge/AI-Gemini%203.1%20Flash%20Lite-4285F4?style=flat-square)](https://ai.google.dev/)

<p align="center">
  <img src="docs/screenshots/upload.png" alt="VedaAI upload screen — question paper and answer sheet dropzones" width="960" />
</p>

<p align="center"><em>Upload both files, then Start Mapping. The review screen shows questions beside the sheet; selecting a question highlights the written answer.</em></p>

---

## Why this exists

Teachers spend a long time lining up printed questions with messy, out-of-order handwriting. This app is meant to answer three things quickly:

1. **Which question was answered**
2. **Where that answer sits on the sheet**
3. **Which questions were left blank**

Grading and AI feedback are included so the mapping view is usable as a first-pass mark book, not only a locator.

---

## Features

- Drag-and-drop or click-to-upload for PDF or image files (question paper + one answer sheet)
- Async job pipeline with real backend stages (convert → extract questions → extract answers → map → grade)
- Sub-parts treated as separate questions (`11 (a)` and `11 (b)` are two rows)
- Original numbering preserved as printed
- Answers written out of order still map by label
- Unanswered questions flagged in the list (score `0`, “Not answered.”)
- Unmapped handwriting shown in its own panel — never silently dropped
- Green bounding-box highlight on the sheet, with a `Qn` tag
- Multi-page answers stitched when a block continues onto the next page
- Per-question score, correct / partial / incorrect, and AI feedback
- Teacher can override score and feedback on the job (in-memory, same lifetime as the job)

---

## Full workflow

```text
Teacher                  Next.js (Vercel)                 Express (Render)                 Gemini
   |                            |                                 |                          |
   |  1. Open /                 |                                 |                          |
   |  2. Drop both files        |                                 |                          |
   |  3. Start Mapping -------->|  POST /api/jobs                 |                          |
   |                            |  multipart: paper + sheet  ---->|  create job, return id   |
   |  4. /review/{jobId}        |                                 |                          |
   |     poll GET /api/jobs/:id |<--------------------------------|  queued                  |
   |                            |                                 |  rasterize PDFs → images |
   |                            |                                 |  extract questions ----->|  JSON questions
   |                            |                                 |  extract answers ------->|  label, transcript, bbox
   |                            |                                 |  map labels → questionId |  LLM only if needed
   |                            |                                 |  grade mapped pairs ---->|  score + feedback
   |  5. Mapping UI             |<--------------------------------|  status: done            |
   |     click question ------> |  page image + overlay           |                          |
   |     highlight on sheet     |                                 |                          |
```

### What each stage does

| Stage | What happens |
| --- | --- |
| **Upload** | Both files are required. The UI enables **Start Mapping** only when both are present. |
| **Rasterize** | Each PDF page (or image) becomes a page image at a consistent size for vision. |
| **Question extraction** | Gemini reads the printed paper in page batches. Labelled sub-parts become separate entries. Shared stems are folded into each sub-part so there is no empty “11” row. |
| **Answer extraction** | Gemini finds handwriting blocks: detected label, transcript, and a tight `bbox` in 0–1000 coordinates. Continuations across pages use `__continuation__`. |
| **Mapping** | Normalize labels (`Q11 (a)` / `11a` / `11-a` → same key). Exact match first. Fuzzy match is skipped for question-like keys so `12` never snaps to `11`. Remaining blocks go through one LLM pass; matches below confidence `0.5` stay **unmapped**. Continuations stitch onto the previous block. |
| **Grading** | Mapped pairs are scored. Unanswered questions get `0` and “Not answered.” Unmapped answers are not graded. If grading fails, mapping and highlights still show. |
| **Review** | Left: question cards + unmapped list. Right: answer sheet. Click a question (or an unmapped block) to jump to that page and draw the highlight. Multi-region answers can step across pages. |

Jobs are stored **in memory** (about 1 hour, or until the API process restarts). Identical file pairs are cached by SHA-256 so a demo re-upload does not re-run Gemini.

---

## Architecture

The UI and the model work are split on purpose. Vercel serverless has a short timeout; a multi-page vision job does not.

```mermaid
flowchart LR
  subgraph web ["web · Next.js · Vercel"]
    Upload["Upload screen"]
    Review["Review / mapping"]
  end
  subgraph api ["server · Express · Render"]
    Jobs["Job store"]
    Pipe["Pipeline"]
    Cache["File-pair cache"]
  end
  Gemini["Gemini 3.1 Flash Lite"]
  Upload -->|POST /api/jobs| Jobs
  Review -->|GET poll + page images| Jobs
  Jobs --> Pipe
  Pipe --> Cache
  Pipe --> Gemini
```

| Unit | Role | Host |
| --- | --- | --- |
| `/web` | App Router UI only. Talks to the API over HTTP. | [Vercel](https://ai-tutor-rag.vercel.app/) |
| `/server` | Upload, rasterize, Gemini calls, mapping, grading, in-memory jobs. | Render (`https://ai-tutor-rag.onrender.com`) |

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4 |
| Backend | Node.js, Express 5, TypeScript |
| AI | Google Gemini (`gemini-3.1-flash-lite` by default), JSON-mode vision |
| PDF / images | `pdf-to-img`, `pdf-lib`, `sharp` |
| Mapping helpers | `fastest-levenshtein` (limited fuzzy; never for question-like keys) |
| Local API | Docker Compose optional (`docker-compose.yml`) |

---

## Getting started

**Requirements:** Node.js 20+, a [Gemini API key](https://aistudio.google.com/apikey).

```bash
git clone https://github.com/Binary0011247/AI-Tutor-RAG.git
cd AI-Tutor-RAG
```

### 1. Server

```bash
cd server
cp .env.example .env
# set GEMINI_API_KEY and ALLOWED_ORIGIN=http://localhost:3000
npm install
npm run dev
```

API listens on `http://localhost:4000`. `GET /health` should return `{ "status": "ok" }`.

### 2. Web

```bash
cd web
echo 'NEXT_PUBLIC_API_BASE_URL=http://localhost:4000' > .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment

**`server/.env`**

```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-flash-lite
PORT=4000
ALLOWED_ORIGIN=http://localhost:3000
```

On Render, do **not** set `PORT` (the platform injects it). Set `ALLOWED_ORIGIN` to the Vercel origin.

**`web/.env.local`**

```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

On Vercel, set this to the public API origin, e.g. `https://ai-tutor-rag.onrender.com`.

---

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Liveness. Used by Render and by the upload page to wake a cold instance. |
| `POST` | `/api/jobs` | Multipart `questionPaper` + `answerSheet` → `{ jobId }`. Rate limit: 10 / IP / minute. |
| `GET` | `/api/jobs/:id` | Job status, progress, warnings, result when `done`. |
| `GET` | `/api/jobs/:id/pages/questionPaper/:n` | Rasterized question-paper page. |
| `GET` | `/api/jobs/:id/pages/answerSheet/:n` | Rasterized answer-sheet page. |
| `PATCH` | `/api/jobs/:id/grade-overrides` | Teacher score / feedback override (job must be `done`). |

Job status: `queued` → `converting` → `extracting_questions` → `extracting_answers` → `mapping` → `done` \| `error`.

---

## Project layout

```text
AI-Tutor-RAG/
├── web/                  Next.js UI
│   └── src/components/   Upload, extracting, mapping, highlight overlay
├── server/               Express API
│   └── src/
│       ├── routes/       jobs.ts
│       ├── services/     rasterize, extractQuestions, extractAnswers, mapAnswers, grade, gemini
│       └── store/        in-memory jobs, page images, result cache
└── docs/screenshots/
```

---

## Assumptions and limits

- One student, one answer sheet per job — no class roster or batch upload.
- No authentication and no database. Jobs expire with the in-memory TTL (~1 hour) or an API restart.
- Grading is AI assistance, not a certified mark scheme. Printed max marks are inferred from question wording when the paper does not supply them in a structured way.
- Mapping is probabilistic. Ambiguous labels stay in **Unmapped answers** rather than being forced onto a question.
- Poor scans, heavy overwriting, or unreadable handwriting reduce transcript and bbox quality.
- The Render free instance can cold-start. The upload page pings `/health` so the first job is less likely to hit a sleeping dyno; the first request after idle can still take a short wait.
- Gemini has daily quota. If the API returns a quota error, wait until reset (Pacific midnight) or use another key.
- Product chrome (Classroom, Library, Toolkit, notifications) is visual only.

---

## Design

UI follows the VedaAI hiring-assignment Figma (upload, extracting, mapping). Accent is coral (`#E8734A`); highlights on the sheet are green rounded outlines with a `Qn` tag.

---

