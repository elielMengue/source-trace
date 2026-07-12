# Privacy Policy — Source-Trace

_Last updated: 2026-07-12_

Source-Trace is a browser extension, backed by an optional analysis service
(`st-api`), that coaches you to trace the claims in an AI answer. This policy
explains exactly what data the extension and the service handle, and what they
do **not**.

Source-Trace has **no user accounts, no advertising, no analytics or tracking,
no cookies, and no sale of data**. There is nothing to log into.

## The short version

- **Privacy mode runs fully on your device.** In this mode the extension never
  sends the content of an AI answer anywhere — all analysis happens locally in
  your browser.
- **Full mode** sends the text of the answer you're viewing to the Source-Trace
  backend so it can be analyzed, and — only when you explicitly click **Deep
  trace** on a specific claim — to a third-party LLM with web search. You choose
  the mode; you can switch to Privacy mode at any time.
- The backend keeps **no content database** and its logs contain **no answer
  text** — only content hashes, timing, and non-identifying counts.

## What the extension stores

The extension uses the `storage` permission to keep your **settings only**:
your chosen mode (privacy / full), your locale for coaching tips, and the API
base URL. These live in `chrome.storage.local` on your device. **No answer
content is ever stored by the extension.**

The extension requests host access to the AI sites it supports
(`perplexity.ai`, `chatgpt.com`, and their variants) so it can read the answer
in the page and paint the overlay, and to the Source-Trace API origin so it can
send analysis requests in Full mode. It does not read any other site.

## What is sent to the backend (Full mode only)

When you use **Full mode**, the extension sends the following to `st-api` for a
single analysis and does not send it anywhere else:

- the **text of the AI answer** currently displayed, and any citation links the
  page exposes;
- **context metadata**: which site the answer came from, your locale, and the
  extension version.

The backend uses this to compute a *Trace Report* — which claims have visible
sourcing and how to trace the weak ones. It **never** returns a true/false
verdict.

### How the backend handles that data

- **No content database.** The service is stateless; it does not persist your
  answers to durable storage.
- **Content-free logs.** Logs record a content *hash* (an irreversible
  fingerprint), timings, and aggregate counts — never the answer text.
- **Short-lived cache.** To avoid recomputing identical requests, a computed
  Trace Report may be held in a cache (in memory, or Redis if configured) for up
  to **7 days**, keyed by a content hash. This cache can contain the short claim
  excerpts that appear in the report. It expires automatically and is not shared
  with anyone.

## Third-party processing (Deep trace and Full-mode extraction)

Some features send text to a third-party Large Language Model provider:

- **Deep trace** (only when you click it on a specific claim) sends that claim
  and its surrounding context to an LLM with web search, to gather *independent
  sources* and a neutral note on each. Depending on the deployment this provider
  is **Anthropic (Claude)** or **Google (Gemini)**.
- **Full-mode claim extraction** may send the answer text to the same provider
  to segment it into claims.

Where the provider supports it, Source-Trace requests **zero-retention**
processing (the provider does not retain the text after answering). When Google
Gemini is used (the public demo deployment), the data is processed under
Google's terms. Deep trace is **never** invoked automatically — only on your
explicit click — and if no provider is configured the feature simply reports
"unavailable" and falls back to on-device reverse-search links.

Relevant provider policies:
- Anthropic: https://www.anthropic.com/legal/privacy
- Google: https://policies.google.com/privacy

## Data we never collect

- No names, emails, or account identifiers (there are no accounts).
- No browsing history, and no reading of pages other than the supported AI
  sites while you have an answer open.
- No advertising or analytics identifiers, no cross-site tracking, no cookies.

## Your controls

- **Switch to Privacy mode** to keep everything on-device.
- **Don't click Deep trace** if you don't want a claim sent to an LLM.
- **Uninstall** the extension to remove all stored settings; clearing the
  browser's extension storage does the same.

## Children

Source-Trace is not directed to children under 13 and does not knowingly
collect data from them.

## Changes

Material changes to this policy will be reflected here with an updated date.

## Contact

Questions about this policy: **mengueeliel712@gmail.com**
