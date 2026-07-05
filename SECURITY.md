# Security & Development Setup

## Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Then fill in your values:
- `GEMINI_API_KEY`: Your Google Gemini API key (never commit)
- `PORT`: Dev server port (default 5173, auto on conflict)
- `NODE_ENV`: Set to 'development' or 'production'

## Dev Server
The dev server runs on `http://localhost:5173/Inncempro-markettool/` with automatic port switching if 5173 is busy.

To use a specific port:
```bash
PORT=3000 npm run dev
```

## Security Notes
- Never commit `.env.local` (it's in `.gitignore`)
- Keep API keys out of the browser console
- Environment variables are only available at build time for frontend

## Production Build
```bash
npm run build
```

This creates an optimized build in `dist/`. All data stays local to the browser (localStorage).
