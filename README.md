# Wanderly AI

Full‑stack AI travel assistant.

## Apps

- `wanderly-ai-backend/` – Node.js + Express + PostgreSQL + OpenAI + Google Places
- `wanderly-ai-client/` – React + Vite + Tailwind + Leaflet

## Dev setup

### Backend
```
cd wanderly-ai-backend
npm install
# .env
PORT=5050
OPENAI_API_KEY=... 
DATABASE_URL=postgresql://...    # Render/Supabase/etc.
GOOGLE_API_KEY=...               # or GOOGLE_PLACES_API_KEY

npm run dev
```
Health: `GET http://localhost:5050/health`

### Frontend
```
cd wanderly-ai-client
npm install
echo "VITE_API_BASE=http://localhost:5050" > .env.local
npm run dev
```

## Highlights

- AI search (single‑language EN/VI) with OpenAI
- Google Places Text Search + photo proxy
- Places list synced with map markers (numbered)
- Comments/ratings API for local places

## Deploy

- Backend: Render/Railway + managed Postgres (set env vars)
- Frontend: Vercel/Netlify (set `VITE_API_BASE`)

## Security

- Do not commit `.env` files.
- Google/OpenAI/Yelp keys must be provided via environment variables.


