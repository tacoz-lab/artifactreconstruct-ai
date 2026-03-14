# artifactreconstruct-ai

AI-powered archaeological artifact reconstruction app.

## Architecture

- Frontend: Vite + React, deployed to GitHub Pages.
- Backend: Node.js Express API that calls Gemini models.
- Security: `GEMINI_API_KEY` is used only on backend server, never in browser bundle.

## Local Development

Prerequisites:

- Node.js 20+

Steps:

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env.example .env`
3. Set `GEMINI_API_KEY` in `.env`.
4. Start frontend + backend:
   - `npm run dev`

Local endpoints:

- Frontend: `http://localhost:3000/artifactreconstruct-ai/`
- Backend health: `http://localhost:8787/api/health`

## Deploy Frontend To GitHub Pages (Automatic)

This repo includes workflow `.github/workflows/deploy-pages.yml`.

1. In GitHub repository settings, go to Pages.
2. Set source to `GitHub Actions`.
3. Push to `main`.
4. Workflow builds `dist` and deploys to Pages.

The workflow now fails early with a clear error if `VITE_API_BASE_URL` is missing or not an `http(s)` URL.

## Backend Deployment (Required For Production API Calls)

GitHub Pages is static-only, so `/api/*` routes cannot run on Pages directly.

Deploy `server/index.js` to any Node host (for example Render, Railway, Fly.io, Azure App Service), then set:

- Repository variable `VITE_API_BASE_URL` to your backend origin (for example `https://your-api.example.com`).
- Backend env `GEMINI_API_KEY`.
- Backend env `ALLOWED_ORIGINS` to include your Pages origin (for example `https://tacoz-lab.github.io`).

Then trigger a new Pages deploy so the frontend builds with the backend URL.

## Scripts

- `npm run dev`: Run backend and frontend together
- `npm run dev:api`: Run backend only
- `npm run dev:web`: Run frontend only
- `npm run build`: Build frontend for production
- `npm run preview`: Preview built frontend
- `npm run start:api`: Run backend in production mode
