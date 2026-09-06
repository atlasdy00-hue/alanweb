# alan-visona-site

Personal academic homepage: four hash-routed pages (Home, Teaching,
Biography, Contact). No build step, no framework — just static files.
Open `index.html` directly in a browser (or run a tiny local server, see
below), or drop the whole folder on any static host.

## Project layout

```
index.html               page structure only — no text, no styling, no logic
styles.css                all CSS
content/home.js           Home page text
content/teaching.js       Teaching page text
content/biography.js      Biography page text
content/contact.js        Contact page text
data/publications.js      publication list, synced from Google Scholar
scripts/content.js        reads content/*.js and fills the page in
scripts/router.js         page routing + renders the publications list
scripts/lattice.js        Home page cover animation
scripts/crystal.js        Biography page cover animation
scripts/contour.js        Teaching page cover animation
scripts/fetch_publications.py   pulls fresh data from Google Scholar
tools/build_artifact.py   internal only — see note at the bottom
```

## Editing content

Everything you'd normally want to change lives in the four files under
`content/` — one per page, plain text, no HTML. Each is a `.js` file only
because that's what lets it load with no server and no build step; open
one and the only "code" you'll see is the first and last line. In between
it reads like a document:

```
## Tagline
Physics graduate working in **condensed matter physics** — spin-wave dynamics...

## Currently
looking for a PhD position in condensed matter physics...
```

A few conventions, used consistently across all four files:

- `## Heading` marks where one piece of text starts — leave these lines
  exactly as they are; everything below a heading, up to the next one, is
  that section's text.
- Leave a blank line between paragraphs, same as in any normal document.
- `**text**` renders bold.
- `[label](url)` renders a link. A relative `url` (a file committed to the
  repo, e.g. `[preprint](files/paper.pdf)`) opens in the same tab; an
  `http(s)://` url opens in a new tab.
- Wrapping a whole value in `[brackets]` — e.g. `[your.email@example.com]`
  — marks it as a placeholder: it shows on the page in a visibly
  unfinished, italic style. Replace the whole thing, brackets included, to
  make it look like normal finished text.
- In `content/home.js`, every `## Interest: <name>` section becomes one
  card under "Research interests" — add, remove, or rename freely, in
  whatever order you want them to appear.
- In `content/teaching.js`, every section except `## Intro` becomes one
  row on the page, labeled by the heading with any trailing number
  stripped (`## Role 1` and `## Role 2` both show the label "Role").

`index.html` itself now holds no text and no styling — just the page
structure (which section goes where) and a `data-slot="..."` marker
showing where each piece of `content/` text gets inserted. You shouldn't
need to open it for routine edits.

Visual style lives in `styles.css` — colors are CSS custom properties at
the top (`--accent`, `--ink`, etc.), so a palette change is a few lines,
not a hunt through the file.

Publications are the one thing you generally shouldn't hand-edit: they
live in `data/publications.js` and are regenerated from Google Scholar
(see below). If you need to fix one entry by hand, its shape is:

```json
{
  "year": 2024,
  "title": "...",
  "venue": "Journal Name, volume(issue), page",
  "citedBy": 19,
  "link": "https://...",
  "authors": [{ "name": "A. Rossi" }, { "name": "A. Visonà", "me": true }]
}
```

## Previewing locally

Opening `index.html` by double-clicking it works in most browsers. If your
browser is fussy about loading local `<script src>`/`<link>` files from
`file://`, run a one-line local server from the project folder instead:

```bash
python -m http.server 8000
```

then visit `http://localhost:8000`.

## Keeping publications in sync with Google Scholar

```bash
pip install -r requirements.txt
python scripts/fetch_publications.py
```

This re-scrapes your Scholar profile
(`https://scholar.google.com/citations?user=-hKl4UYAAAAJ`) and rewrites
`data/publications.js` in place — nothing else in the project changes.

A GitHub Action (`.github/workflows/refresh-publications.yml`) runs this
weekly and commits the result once the repo is pushed to GitHub. **Caveat:**
Google Scholar frequently blocks scraping from datacenter IPs, which
includes GitHub-hosted runners — the Action may fail intermittently with a
CAPTCHA/blocked error. If that happens regularly, run the script from your
own machine instead (`workflow_dispatch` lets you trigger it manually too,
but the same IP-blocking risk applies on GitHub's runners).

## Deploying (GitHub Pages)

The site is plain static files, so hosting is just "serve this folder".
GitHub Pages is the simplest fit: the repo *is* the deployment, it's free,
HTTPS and a custom domain are included, and the publications Action above
already assumes it.

### First-time setup

1. Create an **empty** repo on GitHub — `github.com/new`, no README /
   licence / .gitignore. Any name works (e.g. `alan-visona-site`); it only
   has to be `<username>.github.io` if you want the default URL to be a
   bare `username.github.io`.
2. From this folder, point the local repo at it and push:

   ```bash
   git remote add origin https://github.com/<username>/<repo>.git
   git push -u origin main
   ```

3. Repo **Settings → Pages** → *Build and deployment* → Source:
   **Deploy from a branch**, Branch: **main**, folder: **/ (root)**. Save.
4. Wait ~1 min. The site is live at
   `https://<username>.github.io/<repo>/` (or `https://<username>.github.io/`
   for a `<username>.github.io` repo).

`.nojekyll` in the repo root tells Pages to serve every file as-is with no
Jekyll processing. Asset paths are relative and routing is hash-based, so
the site works unchanged whether it's served from a subpath or a root
domain — nothing to configure.

### Custom domain — www.alanvisona.com

The `CNAME` file in the repo root holds `www.alanvisona.com`. GitHub
serves the site there and 301-redirects the bare `alanvisona.com` to it
(the apex `A` records below are what make that redirect work). `www` as
the primary is the more reliable setup for HTTPS-certificate issuance
than an apex-only `A`-record configuration.

**DNS** (managed in Cloudflare — DNS provider for alanvisona.com). All
records **"DNS only" / grey cloud**, never proxied — a proxied record
stops GitHub issuing the certificate.

| Type | Name | Value | Proxy |
|------|------|-------|-------|
| CNAME | `www` | `atlasdy00-hue.github.io` | DNS only |
| A | `@` | `185.199.108.153` | DNS only |
| A | `@` | `185.199.109.153` | DNS only |
| A | `@` | `185.199.110.153` | DNS only |
| A | `@` | `185.199.111.153` | DNS only |

Optional IPv6 for the apex: `AAAA @` → `2606:50c0:8000::153`,
`2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`.

**In the repo:** Settings → Pages → Custom domain reconciles itself to
whatever the `CNAME` file says, so pushing a change to that file is
enough — no need to touch the field. Tick **Enforce HTTPS** once the
certificate is issued (usually 15 min–1 h after the DNS check passes).

DNS changes can take from a few minutes to a few hours to propagate.

### Updating the site

Edit files, commit, push to `main` — Pages redeploys automatically in
under a minute. No build step.

### Hosting files for visitors to download

Drop the file anywhere in the repo (e.g. a `files/` or `pdf/` folder) and
link to it with a normal relative link from the relevant `content/*.js`
section — `[label](files/paper.pdf)` style links render as links. Keep
individual files under ~50 MB and the whole repo well under 1 GB; for
anything larger (datasets, video) link out to Zenodo or institutional
storage instead of committing it here.

## `tools/build_artifact.py` — not part of your workflow

This script inlines `styles.css` and every referenced `.js` file into one
self-contained HTML file. It exists only so a live preview of this site
can be published as a Claude Artifact, which requires a single file with
no sibling assets — GitHub Pages never needs it, and you shouldn't need to
run it yourself.
