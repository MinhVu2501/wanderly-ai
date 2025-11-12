## Wanderly AI – Frontend (React + Vite)

Bilingual travel assistant UI with AI search, interactive map (Leaflet), and trip results.

### Quick start
1) Install
```
cd wanderly-ai-client
npm install
```
2) Set API base (dev)
```
echo "VITE_API_BASE=http://localhost:5050" > .env.local
```
3) Run
```
npm run dev
```

### Features
- i18n (EN/VI) with `react-i18next`
- Google Places powered search via backend
- Leaflet map with numbered markers and image popups
- Places list synced with map (click to focus/open popup)
- Tailwind CSS v4 styling

### Env
- `VITE_API_BASE` – backend URL (default `http://localhost:5000` if not set)

### Build
```
npm run build
npm run preview
```
