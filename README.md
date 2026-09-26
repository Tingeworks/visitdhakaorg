# Dhaka City Wiki (visitdhaka.org)

A community-oriented city wiki for Dhaka, Bangladesh, built to rank for tourist-intent searches ("Dhaka", "things to do in Dhaka", "Dhaka travel guide") while also serving as a general reference about the city.

A secondary goal is to serve as a public showcase project for [Tingeworks](https://tingeworks.com), a research-led UX, design and engineering studio based in Dhaka.

> **Pre-launch:** the site is currently hidden from search engines. See [Going live](#going-live).

## Domain and naming

- Pattern: **visit + city** (`visitdhaka.org`). It mirrors real tourist search phrases ("visit dhaka") and reads as credible.
- `.com` is preferred for tourist-facing trust and click-through if available. `.org` is an acceptable fallback and still reads as community-driven.
- Considered and set aside: RickshawWiki (too narrow, reads as "about rickshaws"), DhakaPedia, Dhaka Commons.
- **Launching for Dhaka only.** A companion `visitchittagong.org` is deferred until the Dhaka site has traction, to avoid splitting effort and backlink authority across two domains.

## Tech stack

| Area | Choice |
| :--- | :--- |
| Framework | [Astro](https://astro.build) with the [Starlight](https://starlight.astro.build) docs template |
| CMS | tingeworks CMS, built on [Sveltia CMS](https://sveltiacms.app) (git-based), admin at `/admin/` |
| Hosting | GitHub repo, deployed to Cloudflare Pages on push to `main` |
| Search | Pagefind (bundled with Starlight), static and client-side |
| Maps | Leaflet (planned) for an areas and attractions map |
| Media | Committed to the repo (Sveltia default) |
| Analytics | Cloudflare Web Analytics (planned), privacy-friendly with no cookie banner |

**Why Starlight:** it ships with sidebar navigation, full-text search, i18n and content collections, which map closely onto what a wiki needs. Astro's islands architecture sends almost no JavaScript by default, which helps Core Web Vitals and LCP, both Google ranking factors.

**Why Sveltia CMS:** git-based, open source, free, actively developed, with strong i18n. Alternatives considered were Pages CMS (simpler, hosted OAuth) and TinaCMS (best live visual editing, but heavier and possibly paid at scale). Revisit if contributor experience becomes a blocker.

**Media and R2:** Cloudflare R2 is deferred, not rejected. Sveltia has no native R2 or S3 upload integration. If R2 is added, images would be uploaded externally (dashboard, `aws-cli` or `rclone` via the S3-compatible endpoint, or a custom Worker) and referenced by public URL in content fields. The domain must then be allow-listed under `image.domains` in `astro.config.mjs`.

## Project structure

```
.
├── public/
│   ├── admin/
│   │   └── config.yml        # tingeworks CMS configuration
│   └── robots.txt            # Pre-launch: disallows all crawlers
├── src/
│   ├── assets/
│   ├── content/
│   │   └── docs/             # Wiki content (.md / .mdx)
│   ├── pages/
│   │   └── admin/index.astro # tingeworks CMS admin UI, served at /admin/
│   └── content.config.ts
├── astro.config.mjs
└── package.json
```

Starlight exposes each `.md` or `.mdx` file in `src/content/docs/` as a route based on its path. Images go in `src/assets/` and can be embedded with a relative link. Static files go in `public/`.

## Commands

Run from the project root:

| Command | Action |
| :--- | :--- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the local dev server at `localhost:4321` |
| `pnpm build` | Build the production site to `./dist/` |
| `pnpm preview` | Preview the build locally |
| `pnpm astro ...` | Run Astro CLI commands such as `astro add` |

## Content management (tingeworks CMS)

tingeworks CMS is [Sveltia CMS](https://sveltiacms.app) under the hood. The admin UI lives at `/admin/`. It is loaded from the `@sveltia/cms` npm package in `src/pages/admin/index.astro`, and configured in `public/admin/config.yml`.

- **Local editing:** run `pnpm dev`, open `http://localhost:4321/admin/` in Chrome or Edge, and choose "Work with Local Repository". No login is needed.
- **Production login:** GitHub personal access token for now, which suits a solo or small team. Add the [`sveltia-cms-auth`](https://github.com/sveltia/sveltia-cms-auth) Cloudflare Worker later if non-technical contributors need proper OAuth.
- **Collections:** one per content pillar (below), each exposing only the fields that pillar uses. Tick **Fact-checked by an editor** on a page once you have verified it.

## Content pillars

Each pillar is a folder in `src/content/docs/` with consistent typed frontmatter (coordinates, category, tags, hours and so on) to support structured data and faceted browsing. The starter pages contain only well-known facts and are all marked `verified: false` until an editor checks them.

1. **Overview:** history, geography, climate, demographics. The primary "about Dhaka" page.
2. **Areas and Neighborhoods:** one page per area (Old Dhaka, Gulshan, Banani, Dhanmondi, Uttara, Mohammadpur).
3. **Attractions and Landmarks:** Lalbagh Fort, Ahsan Manzil, National Parliament, Sadarghat, mosques, temples, museums. Include coordinates, hours, entry fees and best time to visit.
4. **Food and Dining:** street food guides, iconic dishes (biryani, fuchka, kacchi), restaurant and market roundups by area and budget.
5. **Getting Around:** rickshaws, CNG auto-rickshaws, ride-share apps (Pathao, Uber), metro rail, buses, traffic realities.
6. **Where to Stay:** hotel and guesthouse guides by area and budget tier.
7. **Culture and Festivals:** Pohela Boishakh, Eid, Ekushey Book Fair, arts, religious diversity.
8. **Practical Info for Visitors:** visa on arrival, currency and ATMs, SIM cards, safety, emergency numbers, basic Bangla phrases, health and vaccinations.
9. **Shopping:** New Market, Bashundhara City, local craft markets.
10. **Day Trips:** Sonargaon, Panam City, nearby riverine destinations.

Supporting content:

- **Events and blog:** regularly updated posts as a freshness signal.
- **Community local guides and stories:** first-person content for long-tail keywords and E-E-A-T credibility.

Top-level navigation should be grouped by **visitor intent** (Explore / Eat / Stay / Get Around / Plan Your Trip), not a flat alphabetical list.

The content model leans towards [MyHelsinki](https://www.myhelsinki.fi) (tourism) rather than [hel.fi](https://www.hel.fi) (resident services), because tourist search visibility is the priority. It keeps the wiki spirit of comprehensive, structured, community-editable content.

## SEO strategy

- Verify Google Search Console and Bing Webmaster Tools, and submit the sitemap. This is non-negotiable once live.
- Generate `sitemap.xml` with `@astrojs/sitemap` (requires the `site` option in `astro.config.mjs`).
- Structured data: schema.org JSON-LD (`TouristAttraction`, `LocalBusiness`, `FAQPage`) per relevant page, driven by frontmatter through one reusable component.
- OpenGraph and social preview images per page.
- Realistic goals: the site won't quickly outrank Wikipedia, TripAdvisor or the Google Knowledge Panel for the bare term "Dhaka". Near-term targets are "Dhaka wiki", "Dhaka travel guide" and "things to do in Dhaka", growing through content depth, backlinks and freshness.

## Going live

The site is deliberately hidden from search engines until launch:

- `public/robots.txt` disallows all crawlers.
- `astro.config.mjs` adds `<meta name="robots" content="noindex, nofollow">` to every Starlight page through the `head` option. `/admin/` has its own `noindex`.

To launch, delete `public/robots.txt`, remove the `head` line in `astro.config.mjs`, set `site` so the sitemap is generated, then submit the sitemap in Search Console and Bing Webmaster Tools.

## Roadmap

- [x] Install the CMS (Sveltia) and add the admin entry point and base `config.yml`
- [x] Set the GitHub `repo` and production URL (`https://visitdhaka.org`) in `public/admin/config.yml`
- [x] Write CMS collections matching the content pillars
- [x] Extend the Astro content schema (Zod) with the shared pillar fields
- [x] Scaffold the 10 pillars with starter pages (35 pages)
- [ ] Fact-check every starter page and set `verified: true` (find them with `grep -rl "verified: false" src/content/docs`)
- [ ] Fill in opening hours, fees, prices and coordinates from first-hand or official sources
- [ ] Buy the domain and point DNS at Cloudflare
- [ ] Set up Cloudflare Pages deployment
- [ ] Add a reusable JSON-LD structured data component
- [ ] Add Leaflet map integration for Areas and Attractions
- [ ] Write the first batch of real content before launch (thin content won't rank regardless of technical setup)
- [ ] Add a privacy policy, cookie notice and "About / who runs this" page (E-E-A-T, since travel-safety info is close to YMYL)
- [ ] Add Cloudflare Web Analytics
- [ ] Remove the pre-launch `noindex` and `robots.txt`, then verify Search Console and Bing and submit the sitemap

## Decided against or deferred

- **Real-time anonymous MediaWiki-style editing:** needs a persistent backend and database, which conflicts with the static Cloudflare Pages approach. Moderated public editing (a Worker that opens pull requests) is proposed instead. See [`docs/`](docs/README.md).
- **Cloudflare R2 for media:** deferred until image volume grows.
- **`sveltia-cms-auth` Worker:** deferred until non-technical contributors join.
- **A second city domain (Chittagong):** deferred until the Dhaka site has traction.
