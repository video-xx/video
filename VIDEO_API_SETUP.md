# Add a video API (3 steps)

The browser never sees your API key. A small Cloudflare Worker (in `worker/`) talks to the video API.
Videos, **Show more** paging, search and **categories** all come from the API automatically.

## 1. Pick the API (edit `worker/wrangler.jsonc`, section `vars`)

**Known provider** - set one word (`eporner`, `pexels` or `pixabay`):

    "API_PRESET": "pexels"      (or "pixabay")

**Any other API** - leave `API_PRESET` empty and fill two lines:

    "API_BASE_URL": "https://api.example.com/v1",
    "API_LIST_PATH": "videos"

The Worker finds the video list in the response and maps title, thumbnail, video link, channel, views,
duration and categories/tags by itself. Only if it picks something wrong, use the optional vars:
`API_ITEMS_PATH` (where the list is, e.g. `data.items`), `API_SEARCH_PATH`, `API_CATEGORIES_PATH`,
`API_AUTH_MODE` (`header` / `query` / `none`), `API_AUTH_NAME` (header or query-parameter name for the key),
`API_FIELDS` (JSON, e.g. `{"title":"snippet.title"}`).

Categories: taken from the API's categories endpoint if you set `API_CATEGORIES_PATH`, from the preset's topic
list, and from the categories/tags on the videos themselves. They appear as filter buttons on its own.

## 2. Deploy

    cd worker
    npm install
    npx wrangler login
    npx wrangler secret put VIDEO_API_KEY        # your API key (skip if the API needs none)
    npm run deploy

It prints a URL like `https://aevy-video-api.<account>.workers.dev`.

## 3. Point the site at it

In `js/config.js` set `videoApiBase` to that URL (no trailing slash). Done.

Check `<worker-url>/api/health` - it should show `providerConfigured: true` and `apiKeySet: true`.

## Optional: Supabase cache
Run `supabase/schema.sql` (it includes the video catalog), then add the secrets
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` with `npx wrangler secret put ...`.
The Worker then saves every video and category it sees and serves them if the provider is down.
Without these secrets everything still works live. `ADMIN_SYNC_TOKEN` (secret) enables `POST /api/sync`.

## Notes
- There is no demo content: until an API is connected the feed shows only videos shared by members.
- Provider quotas, Cloudflare limits and Supabase limits still apply. Only metadata and links are stored.
- Production: set `ALLOWED_ORIGIN` in `wrangler.jsonc` to your site's address instead of `*`.
