# Spes extension

Private Manifest V3 Chrome/Edge extension for tracking job applications (two users). Firebase Auth (Google) and Firestore are wired; Gemini is not.

## Requirements

- Node.js 20+
- Google Chrome and/or Microsoft Edge

## Scripts

```bash
npm install
npm run dev      # Vite + CRXJS HMR (load dist/ once, then leave this running)
npm run build    # production bundle into dist/
npm run watch    # rebuild dist/ on file changes
```

Copy `.env.example` to `.env` and fill in the Firebase web app keys, then build. Vite inlines `VITE_*` values at build time — change `.env`, then rebuild.

Load the unpacked extension from the `dist/` folder after a build (or after `npm run dev` has written `dist/`).

## Load unpacked — Chrome

1. Run `npm run build` (or start `npm run dev`).
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select `spes-extension/dist`.
6. Click the Spes icon in the toolbar to open the popup. On the extension card, click **Details → Extension options** for the options page.

## Load unpacked — Microsoft Edge

Same bundle; Edge is Chromium and uses this Manifest V3 package as-is.

1. Run `npm run build` (or start `npm run dev`).
2. Open `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select `spes-extension/dist`.
6. Pin Spes and open the popup, or open **Details → Extension options**.

After code changes: `npm run build` (or keep `npm run dev` / `npm run watch` running), then click **Reload** on the extension card.

## Firebase

Project: `spec-6dd69`. Do not commit `.env`.

### Authorized domain (required for Google sign-in)

`signInWithPopup` runs in a real window (`src/popup/index.html?auth=1`), not the toolbar popup. Add this extension's origin in Firebase Console → Authentication → Settings → Authorized domains:

`chrome-extension://<your-extension-id>`

Copy the ID from the extension card on `chrome://extensions` or `edge://extensions`. If this is missing, sign-in fails with `auth/unauthorized-domain`.

### Why not chrome.identity?

The toolbar popup is destroyed when it loses focus, so OAuth started there never gets a result. `chrome.identity.getAuthToken` would also need a separate Google Cloud OAuth client of type Chrome extension, tied to this ID. This project already has Firebase's web Google provider, so a dedicated auth window + `signInWithPopup` is the reliable match.

### Firestore rules

`firestore.rules` lets a user read/write only their own `applications/{uid}/items` and `profiles/{uid}`. Any signed-in user can read `streaks`; only the owner can write their streak doc.

Deploy from `spes-extension/`:

```bash
npm i -g firebase-tools
firebase login
firebase deploy --only firestore:rules
```

Until rules are deployed, console test-mode/default rules still apply.

## Permissions (Phase 1 tradeoff)

Declared in `manifest.json`:

| Permission | Why |
| --- | --- |
| `storage` | Local extension state (later). |
| `notifications` | Reminders (later). |
| `alarms` | Scheduled checks (later). |
| `activeTab` | Temporary access to the tab you invoked the extension on. |
| `scripting` | Inject the generic fallback content script **on demand**. |
| Host: `https://*.linkedin.com/*`, `https://*.indeed.com/*` | Auto-inject LinkedIn/Indeed content scripts. |
| Host: Google / Firebase APIs | Auth + Firestore from extension pages. |

**Not declared:** `<all_urls>`.

The generic fallback script (`src/content-scripts/fallback.ts`) is bundled but **not** listed under `content_scripts`. It is meant to be injected with `chrome.scripting.executeScript` after a user gesture (toolbar click). That keeps the extension from reading every page you visit.

Tradeoff vs `<all_urls>`:

- **This setup (chosen):** smaller footprint; fallback extraction only works after you click the extension on that tab. LinkedIn/Indeed still get automatic content-script injection.
- **`<all_urls>`:** fallback could run on every site with no extra click, but the extension could read any page. Too broad for a two-person tool.

`scripting` is still a privileged API. It is narrower than standing host access to the whole web, and we need it for on-demand injection.

Indeed country domains (`indeed.co.uk`, etc.) are not included yet — only `*.indeed.com`.

## Layout

```
spes-extension/
  manifest.json
  src/
    background/          service worker
    content-scripts/     linkedin, indeed, on-demand fallback
    popup/               React popup + Google sign-in window
    options/             React options (base CV / profile later)
    lib/                 firebase.ts, gemini.ts stub, types re-export
    types.ts             shared data-model types
```
