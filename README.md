# ResumeAI

AI-powered resume and job application assistant.

## Structure

- `Final-Project/` — Node.js/TypeScript backend (Express, Prisma, ML fit-score)
- `frontend_son/` — Frontend UI (HTML + React components)

## Backend setup

```bash
cd Final-Project
npm install
cp .env.example .env   # configure database and secrets
npx prisma migrate dev
npm run dev
```

## Frontend

Open `frontend_son/index.html` in a browser or serve the folder with any static file server.
