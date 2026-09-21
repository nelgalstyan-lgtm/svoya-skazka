# Gemini backend for Svoya Skazka

This minimal backend is meant to be the bridge between the static site and Google Gemini for image generation.

## 1) Install dependencies

```bash
cd server
npm install
```

## 2) Create environment file

```bash
cp .env.example .env
```

Then fill in your actual value:

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
PORT=3000
```

## 3) Start the server

```bash
npm start
```

or in watch mode:

```bash
npm run dev
```

## 4) Health check

```bash
curl http://localhost:3000/api/health
```

## 5) Generate from a prompt string

```bash
curl -X POST http://localhost:3000/api/generate-background \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cozy storybook room with a map table, warm light, portrait aspect ratio 2:3, no text or people."
  }'
```

## 6) Generate from a prompt ID

If you later keep prompts in a JSON file, you can pass `promptId` and the server will try to resolve it from a few standard paths.

## Important

- The key must stay on the backend.
- Never store `GEMINI_API_KEY` in frontend code.
- Use this server only as the API layer between the site and Gemini.
