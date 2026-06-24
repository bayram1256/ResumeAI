# ResumeAI

AI-powered platform for resume analysis, job matching, and cover letter generation. Users upload a resume, add a job description, receive a fit score, get AI-driven improvement suggestions, and export polished documents as PDF or DOCX.

**Repository:** [github.com/bayram1256/ResumeAI](https://github.com/bayram1256/ResumeAI)

---

## Features

- **Authentication** — JWT-based auth with protected API routes
- **Resume upload** — PDF and DOCX parsing with database storage
- **Job descriptions** — create and manage job postings
- **Fit Score** — ML model evaluates resume-to-job match (skills, experience, education)
- **AI suggestions** — resume improvement recommendations via Hugging Face (Qwen2.5)
- **Cover letters** — generate tailored cover letters for specific jobs
- **Export** — download improved resumes and letters as PDF/DOCX
- **5-step workflow** — guided UI: upload → analyze → edit → re-analyze → export

---

## Tech Stack

| Layer | Stack |
|-------|-------|
| **Backend** | Node.js, Express 5, TypeScript, Prisma ORM |
| **Database** | MySQL 8 |
| **AI** | Hugging Face Inference API (Qwen/Qwen2.5-7B-Instruct) |
| **ML** | Python, TensorFlow, scikit-learn (fit score model) |
| **Frontend** | HTML, Vanilla JS + React (islands pattern, CDN) |
| **Documents** | pdf-parse, mammoth, pdfkit, docx |
| **Infrastructure** | Docker Compose |

---

## Project Structure

```
ResumeAI/
├── Final-Project/          # Backend API
│   ├── src/
│   │   ├── controllers/    # auth, resume, job, workflow, coverLetter
│   │   ├── routes/           # REST routes
│   │   ├── services/         # AI, fit score, parser, export
│   │   ├── middleware/       # JWT auth, upload, error handler
│   │   └── python/           # ML inference script
│   ├── prisma/               # database schema and migrations
│   ├── model_assets/         # trained ML model
│   ├── docker-compose.yml
│   └── Dockerfile.backend
│
└── frontend_son/             # Frontend UI
    ├── index.html            # login / registration page
    ├── dashboard.html        # main application
    ├── js/react-ui.js        # React components (islands)
    └── improved-resume.html
```

---

## Quick Start (Docker)

The fastest way to run the full stack:

```bash
cd Final-Project

# Create .env with your Hugging Face API key
echo 'HUGGINGFACE_API_KEY=your_key_here' > .env

docker compose up --build
```

Once running:

| Service | URL |
|---------|-----|
| Backend API | http://localhost:5000 |
| Frontend | http://localhost:5501 |
| MySQL | localhost:3307 |

Health check: `curl http://localhost:5000/health` → `{"status":"ok"}`

---

## Local Setup (without Docker)

### Prerequisites

- Node.js 20+
- MySQL 8
- Python 3.11+ (for ML fit score)
- Hugging Face API key ([get a token](https://huggingface.co/settings/tokens))

### 1. Database

```bash
# Start MySQL and create the database
mysql -u root -p -e "CREATE DATABASE final_project;"
```

### 2. Backend

```bash
cd Final-Project

cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, HUGGINGFACE_API_KEY

npm install

# Python dependencies for the ML model
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-ml.txt

npx prisma generate
npx prisma migrate dev

npm run dev
```

Server runs at **http://localhost:5000**

### 3. Frontend

```bash
cd frontend_son
python3 -m http.server 5501
```

Open **http://localhost:5501** in your browser.

> Use an HTTP server, not `file://` — otherwise API requests will fail due to CORS.

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | MySQL connection string | `mysql://root:root@localhost:3307/final_project` |
| `JWT_SECRET` | Secret for JWT tokens | `your-secret-key` |
| `PORT` | API server port | `5000` |
| `HUGGINGFACE_API_KEY` | Hugging Face API key | `hf_...` |
| `HUGGINGFACE_MODEL` | Model for text generation | `Qwen/Qwen2.5-7B-Instruct` |
| `AI_PROVIDER` | AI provider | `huggingface` |
| `FIT_SCORE_MODEL_BUNDLE` | Path to ML bundle | `./fit_score_model_bundle.zip` |
| `FIT_SCORE_MODEL_DIR` | Model assets directory | `./model_assets` |
| `PYTHON_EXECUTABLE` | Path to Python binary | `.venv/bin/python` |

---

## API

All protected routes require the `Authorization: Bearer <token>` header.

### Authentication

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/register` | Register a new account |
| `POST` | `/api/auth/login` | Login and receive JWT |

### Profile

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/profile` | Current user profile |

### Resumes

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/resumes/upload` | Upload resume (PDF/DOCX) |
| `GET` | `/api/resumes` | List resumes |
| `GET` | `/api/resumes/:id` | Get a single resume |
| `GET` | `/api/resumes/:id/download` | Download resume file |
| `DELETE` | `/api/resumes/:id` | Delete resume |

### Jobs

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/jobs` | Create job description |
| `GET` | `/api/jobs` | List job descriptions |
| `GET` | `/api/jobs/:id` | Get a single job |

### Workflow

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/workflow/analyze` | Run fit score analysis |
| `POST` | `/api/workflow/apply-suggestions` | Apply AI suggestions |
| `POST` | `/api/workflow/cover-letter` | Generate cover letter |
| `POST` | `/api/workflow/export` | Export resume (PDF/DOCX) |
| `GET` | `/api/workflow/exports/recent` | List recent exports |
| `GET` | `/api/workflow/exports/:id/download` | Download export |

### Cover Letters

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/cover-letters` | List cover letters |
| `GET` | `/api/cover-letters/:id/download` | Download cover letter |

---

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Frontend   │────▶│  Express API │────▶│  MySQL (Prisma) │
│  :5501      │     │  :5000       │     └─────────────────┘
└─────────────┘     └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ ML Model │ │ Hugging  │ │ PDF/DOCX │
        │ Fit Score│ │ Face AI  │ │ Export   │
        └──────────┘ └──────────┘ └──────────┘
```

1. User registers and uploads a resume
2. Adds a job description
3. ML model computes fit score (skills, experience, education)
4. AI generates resume improvement suggestions
5. User applies edits and re-analyzes
6. Exports the improved resume and cover letter

---

## Frontend

Hybrid **React Islands** architecture:

- Core logic in Vanilla JS (auth, workflow, API calls)
- 4 React components for interactive widgets:
  - `PasswordInput` — show/hide password toggle
  - `UserBadge` — avatar and email in the sidebar
  - `FitScoreCircle` — circular fit score indicator
  - `SuggestionCard` — AI suggestions with checkboxes

React is loaded via CDN — **no build step required**.

---

## Scripts

```bash
cd Final-Project

npm run dev      # development (nodemon + ts-node)
npm run build    # compile TypeScript → dist/
npm run start    # run compiled server
```

---

## Author

**Bayram** — [github.com/bayram1256](https://github.com/bayram1256)
