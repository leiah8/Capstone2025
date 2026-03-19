# Welcome to your Expo app 👋

Expo application with profile management, resume upload, and automatic skill extraction via a Python FastAPI microservice.

## Get started (App)

1. Install dependencies

   ```bash
   npm install
   ```

2. Set environment variables (create an `.env` or use eas secrets):

```bash
export EXPO_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
export EXPO_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
# Optional edge URL overrides (if omitted, app derives from EXPO_PUBLIC_SUPABASE_URL)
export EXPO_PUBLIC_MATCHING_EDGE_URL="https://YOUR_PROJECT.supabase.co/functions/v1/match-api"
export EXPO_PUBLIC_PARSER_EDGE_URL="https://YOUR_PROJECT.supabase.co/functions/v1/resume-parser"

# Optional direct matching API override (bypasses Supabase edge function)
# iOS simulator: use http://127.0.0.1:8000
# Physical device: use http://<YOUR_MAC_LAN_IP>:8000
export EXPO_PUBLIC_MATCHING_API_URL="http://127.0.0.1:8000"

# Optional direct parser override
export EXPO_PUBLIC_PARSER_URL="https://resume-parser-production-000c.up.railway.app"
```

3. Start the app

   ```bash
   npx expo start
   ```

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **app-example** directory and create a blank **app** directory where you can start developing.

## Resume Parser Service

The resume parser lives in `../resume_parser/` and exposes endpoints:

- `POST /parse/upload` multipart form-data (field: `file`) → parsed JSON with `skills`.
- `POST /parse/url` JSON body `{ "url": "https://..." }` → parsed JSON.

### Hosted parser

The app now defaults to the hosted parser at:

```text
https://resume-parser-production-000c.up.railway.app
```

If you want to proxy parser requests through Supabase Edge Functions, deploy
`supabase/functions/resume-parser` and set:

```bash
supabase secrets set RESUME_PARSER_API_BASE_URL="https://resume-parser-production-000c.up.railway.app"
```

Then set:

```bash
export EXPO_PUBLIC_PARSER_EDGE_URL="https://YOUR_PROJECT.supabase.co/functions/v1/resume-parser"
```

### Run the service locally

From repo root:

```bash
cd resume_parser
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --reload --port 8000
```

Set edge function URLs (or let the app derive them from `EXPO_PUBLIC_SUPABASE_URL`) so the app can call parsing and matching via Supabase. After uploading a resume in the Profile screen, the app sends it to `/parse/upload` and merges unique skills returned.

### Troubleshooting

- Ensure Tesseract is installed: `brew install tesseract`.
- Large or image-only PDFs trigger OCR fallback (slower).
- If CORS issues occur, check `allow_origins` in `api/main.py`.

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
