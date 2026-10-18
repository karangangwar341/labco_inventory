# Frontend

Next.js client application for warehouse, client, and Super Admin workflows.

## Local development

From the repository root, run `npm ci`, copy `.env.example` to `.env.local`, and set `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1`. Start the app with `npm run dev:frontend`.

## Production

Set `NEXT_PUBLIC_API_URL` to the HTTPS API base including `/api/v1` before building when the API uses a different origin; Next.js embeds this public value into the client bundle. For the Vercel Services setup in the repository root, omit it to use the same-origin `/api/v1` route. Build with `npm run build:frontend` and serve the generated app with `npm run start --workspace frontend` on a supported Node.js LTS runtime. Keep the public frontend origin in the API's `CORS_ALLOWED_ORIGINS` list.

Run `npm run lint:frontend` and `npm run typecheck` from the repository root before release. Automated frontend behavior tests are not configured yet.
