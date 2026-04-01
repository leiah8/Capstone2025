# Resume Parser Service

This service now uses OpenAI file inputs plus structured outputs instead of the old OCR and regex pipeline. The parser accepts uploaded resume files or signed resume URLs and returns profile-ready JSON for the app.

## What it extracts

- `bio`
- `location`
- `links.github`
- `links.linkedin`
- `links.instagram`
- `links.twitter`
- `links.portfolio`
- `links.other`
- `skills`
- `interests`
- `education`
- `experience`
- `personal_projects`

The response is shaped so the mobile app can review the parsed content and save it directly into the `profiles` row.

## Local setup

```bash
cd resume_parser
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set these environment variables in `.env` or your deploy platform:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_RESUME_PARSER_MODEL=your_selected_model
OPENAI_REASONING_EFFORT=medium
OPENAI_TIMEOUT_SECONDS=180
```

Recommended defaults:

- `OPENAI_RESUME_PARSER_MODEL` should be set to the model you want the parser service to use.
- Choose a higher-quality model for best extraction accuracy, or a smaller model for lower cost and faster responses.
- `OPENAI_REASONING_EFFORT=medium` is a good starting point for resume extraction. Set it to `none` to reduce latency.

## Run the API

```bash
cd resume_parser
source .venv/bin/activate
uvicorn api.main:app --host 0.0.0.0 --port 8001 --reload
```

The local API auto-loads `resume_parser/.env` on startup, so you do not need
to `source` the env file separately during local development.

Health check:

```bash
curl http://localhost:8001/health
```

Parse a local upload:

```bash
curl -X POST http://localhost:8001/parse/upload \
  -F "file=@/absolute/path/to/resume.pdf"
```

Parse a remote file URL:

```bash
curl -X POST http://localhost:8001/parse/url \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/resume.pdf"}'
```

## How to get the resume parser working in the app

There are two moving pieces:

1. Deploy the FastAPI parser service from `resume_parser/`.
2. Point the app or Supabase edge proxy at that service.

### Parser service env

Set these on the parser deployment:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_RESUME_PARSER_MODEL=your_selected_model
OPENAI_REASONING_EFFORT=medium
OPENAI_TIMEOUT_SECONDS=180
PORT=8001
```

### Supabase edge proxy env

The repo already includes `supabase/functions/resume-parser`. Set:

```bash
RESUME_PARSER_API_BASE_URL=https://your-parser-service.example.com
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

### App env

Use one of these app variables:

```bash
EXPO_PUBLIC_PARSER_EDGE_URL=https://<your-project>.supabase.co/functions/v1/resume-parser
```

or

```bash
EXPO_PUBLIC_PARSER_URL=https://your-parser-service.example.com
```

The app prefers `EXPO_PUBLIC_PARSER_EDGE_URL`, then `extra.parserUrl`, then `EXPO_PUBLIC_PARSER_URL`.

## Deploy To Railway

This repository is a monorepo, so the parser should be deployed as its own
Railway service from the `resume_parser` directory.

Files included for Railway:

- `resume_parser/Dockerfile`
- `resume_parser/railway.toml`
- `resume_parser/.dockerignore`
- `resume_parser/.railwayignore`

### Railway setup

1. Create a new Railway project or service from your GitHub repo.
2. For that service, set the Root Directory to `/resume_parser`.
3. If Railway does not detect the config file automatically, set the Railway Config File path to `/resume_parser/railway.toml`.
4. Add these Railway service variables:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_RESUME_PARSER_MODEL=your_selected_model
OPENAI_REASONING_EFFORT=medium
OPENAI_TIMEOUT_SECONDS=180
PORT=8001
```

5. Deploy the service.
6. In Railway, open the service Settings -> Networking and click Generate Domain.
7. Copy the generated public URL, for example `https://your-parser.up.railway.app`.

### Point the app at Railway

After the Railway parser is live, configure the app with one of these:

```bash
EXPO_PUBLIC_PARSER_URL=https://your-parser.up.railway.app
```

or set this manually in `MyApp/app.json`:

```json
{
  "expo": {
    "extra": {
      "parserUrl": "https://your-parser.up.railway.app"
    }
  }
}
```

If you want the app to go through the Supabase proxy instead of calling Railway
directly, set this on the Supabase Edge Function:

```bash
RESUME_PARSER_API_BASE_URL=https://your-parser.up.railway.app
```

and configure the app with:

```bash
EXPO_PUBLIC_PARSER_EDGE_URL=https://<your-project>.supabase.co/functions/v1/resume-parser
```

### Notes

- The app no longer has a hardcoded hosted parser fallback.
- If no parser URL is configured, parsing will stay disabled instead of silently calling an old parser service.

## Deploy To Railway With `railway up`

If the Railway service already exists but cannot be connected to GitHub, deploy
the parser directly from your machine with the Railway CLI.

Important:

- For `railway up`, deploy the `resume_parser` folder itself as the archive root.
- Do not set the Railway service Root Directory to `/resume_parser` for this flow.
- If you already set the Root Directory to `/resume_parser`, change it back to `/` or leave it empty before deploying from the CLI.

### CLI deploy steps

1. Install the Railway CLI, or use `npx`.
2. Make sure the parser service already exists in the correct Railway project.
3. Add the parser environment variables in the Railway dashboard first:

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_RESUME_PARSER_MODEL=your_selected_model
OPENAI_REASONING_EFFORT=medium
OPENAI_TIMEOUT_SECONDS=180
PORT=8001
```

4. From the repo root, deploy only the parser directory:

```bash
RAILWAY_TOKEN=your_token npx -y @railway/cli@latest up \
  --service "your-parser-service-name" \
  resume_parser \
  --path-as-root
```

5. If your token is not already scoped to the right project/environment, add:

```bash
--environment production
```

6. After deploy succeeds, generate a public domain in Railway and use that URL in the app or Supabase edge function.

## Deployment notes

- `parse/upload` uses Base64 file input, so the whole resume is sent from the parser service to OpenAI.
- `parse/url` sends the signed or public resume URL to OpenAI directly.
- OpenAI file inputs support PDFs and rich documents such as `.doc` and `.docx`.
- For non-PDF files, OpenAI extracts text but not embedded images or charts. If a resume depends on complex visual layout, PDF is the safest format.

## CLI usage

Parse a local file:

```bash
python -m resume_parser.parse_resume --file /absolute/path/to/resume.pdf
```

Parse a remote URL:

```bash
python -m resume_parser.parse_resume --url "https://example.com/resume.pdf"
```

Write JSON to disk:

```bash
python -m resume_parser.parse_resume \
  --file /absolute/path/to/resume.pdf \
  --json out.json
```
