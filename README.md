# Spes

A private Chrome and Microsoft Edge extension (Manifest V3) for tracking job applications together. Two people sign in with Google, keep their applications and profile private, and only share streak activity.

This repository is the source. Each person builds their own copy from a local `.env` file. Do not commit secrets or built zip files.

## Features

- Track applications: title, company, URL, description, status, due date, notes
- Capture a job from LinkedIn, Indeed, or (after you click) any other posting
- Shared streak view only — application details stay per-user
- Profile store for a base CV, reusable bullets, and structured fields
- Review-first autofill on application forms, including many embedded iframes
- Gemini-assisted leftover-field matching, plus CV / cover-letter drafts
- Due-date badge and notifications from a local cache (nothing auto-submits)

## Stack

- Manifest V3, TypeScript, React (popup + options)
- Vite + CRXJS for the extension bundle
- Firebase Auth + Firestore
- Google Gemini API (background worker only)

## Data model

| Path | Who can access |
| --- | --- |
| `applications/{uid}/items/{appId}` | Owner only |
| `profiles/{uid}` | Owner only |
| `streaks/{uid}` | Any signed-in user can read; only the owner can write |

Application fields include `title`, `company`, `url`, `description`, `status` (`to-apply` \| `applied` \| `interview` \| `rejected` \| `offer`), `dueDate`, `notes`, timestamps, and optional CV / cover-letter version tags.

## Setup

You need Node.js 20+, Chrome and/or Edge, a Firebase project, a Google OAuth **Web** client, and a [Google AI Studio](https://aistudio.google.com/apikey) key.

```bash
cd spes-extension
npm install
copy .env.example .env
```

On macOS/Linux use `cp .env.example .env`. Fill in the `VITE_*` values from the Firebase console and AI Studio, then:

```bash
npm run build
```

Load **unpacked** `spes-extension/dist`:

1. Open `chrome://extensions` or `edge://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → select `spes-extension/dist`
4. Pin Spes, sign in with Google, then open **Options** to add profile data

Chrome and Edge each get their own extension ID. Add both to:

- Firebase → Authentication → Authorized domains: `chrome-extension://<id>`
- Google Cloud → the same Web OAuth client → Authorized redirect URIs: `https://<id>.chromiumapp.org/`

### Scripts

| Command | What it does |
| --- | --- |
| `npm run build` | Production bundle into `dist/` |
| `npm run watch` | Rebuild `dist/` on change |
| `npm run dev` | Vite + CRXJS HMR (use `dist/` for daily use) |
| `npm test` | Vitest |

After a rebuild, click **Reload** on the extension card in each browser.

More sign-in, Firestore rules, and reminder detail lives in [spes-extension/README.md](spes-extension/README.md).

## Sharing updates

Chrome will not auto-update an unpacked `dist/` folder. Options:

- Send a rebuilt `dist/` (or a zip of its contents) and have the other person **Load unpacked** again
- Publish as **Private** on the [Chrome Web Store](https://chrome.google.com/webstore/devconsole) and add their Google account as a trusted tester — Chrome then updates on its own

Never commit `dist/`, `dist.zip`, or `.env`. Vite inlines `VITE_*` values at build time.

## Security

- `.env` is gitignored. Copy from `.env.example` only.
- Firestore rules in `spes-extension/firestore.rules` keep applications and profiles owner-only. Deploy them with `firebase deploy --only firestore:rules` from `spes-extension/`.
- The Gemini key stays in the background worker, not in LinkedIn/Indeed content scripts.
- Autofill never submits a form. Extraction is a suggestion until you save.

If a built zip was ever pushed to git, rotate the Gemini key in AI Studio and restrict the Firebase/Google API keys in Google Cloud (HTTP referrers / extension IDs). Removing the file from a later commit does not erase it from git history.
