# MediBridge v38 — Production Readiness Audit

Audit date: 2026-08-25

## Evidence boundaries

Verified directly from the current v37.1 source: 33 SPA pages, frontend/database call sites,
family profiles, general/mental-health consent code, emergency navigation, AI integration,
responsive CSS, current project header snapshot, and mental-health RLS migration.

Verified from the supplied live screenshots: recent mobile/iPad/desktop rendering and the Mental Health empty state.

Unable to verify live runtime: the supplied Netlify origin was not fetchable from this audit environment,
and no synthetic test credentials were provided. I therefore do **not** claim live console/network,
authenticated role flows, Lighthouse/Core Web Vitals, real Supabase latency, or Safari/Firefox/Edge results.

## Verdict

**LIMITED BETA — not production-ready for real sensitive healthcare data yet.**

## Scores

| Area | Score / 10 |
|---|---:|
| Functionality | 7.5 |
| Performance | 7.0 |
| Security | 7.0 |
| UI | 8.0 |
| UX | 7.5 |
| Accessibility | 8.0 |
| Mobile responsiveness | 8.0 |
| Compatibility | 6.5 |
| Maintainability | 5.5 |
| Healthcare trust | 7.0 |

## Prioritised issue register

| ID | Component | Evidence | Severity | Impact | Fix | Effort | Status |
|---|---|---|---|---|---|---|---|
| SEC-01 | Frontend rendering | 180 inline onclick handlers + 248 innerHTML assignments | High | A future XSS bug could expose browser auth/health data | Migrate to addEventListener + DOM/textContent, then remove CSP unsafe-inline | Large | Remaining |
| PRIV-01 | Family + Mental Health | Account owner is the patient_id for managed family subjects | High | Adult family mental-health confidentiality cannot be guaranteed | Add guardian/dependent + independent adult consent model | Large | Remaining |
| PRIV-02 | Privacy operations | No reviewed retention/deletion/export/grievance workflow in supplied UI | High | Real health data needs operational rights and lifecycle controls | Add legal/privacy workflows and DPDP implementation review | Medium/Large | Remaining |
| VIDEO-01 | Video | UI explicitly identifies public Jitsi as prototype | High | Clinical/video privacy not production-reviewed | Use contracted/self-hosted reviewed video and document consent/data flow | Large | Remaining |
| QA-01 | Role workflows | No live credentials; live origin unavailable to runtime audit | High | Cannot certify end-to-end permissions | Add synthetic staging accounts + browser E2E tests | Medium | Unable to Test |
| OPS-01 | Reliability | Monitoring/backups/restore/incident process not verified | High | Outage/data-loss risk | Add monitoring, restore drills and incident runbook | Medium | Remaining |
| SEO-01 | Public site | v37.1 lacked canonical/OG/robots/sitemap | Medium | Weak indexing/social previews | Add SEO metadata + crawler files | Small | Fixed |
| SEO-02 | SPA | Services share one URL | Medium | Individual service pages have weak organic visibility | Add crawlable public routes later | Medium | Remaining |
| PERF-01 | app-v37-1.js | ~399.4 KiB raw / 81.1 KiB gzip | Medium | Parse/maintenance cost | Domain code split after E2E coverage | Medium/Large | Remaining |
| PERF-02 | Supabase reads | 61 select('*') sites | Medium | Over-fetching on slow mobile/data | Measure hot paths and select explicit columns | Medium | Remaining |
| PERF-03 | Static cache | No v37.1 cache policy in patch | Medium | Repeat downloads | Immutable versioned JS/CSS + revalidated HTML | Small | Fixed |
| DEP-01 | Supabase JS | Floating @2 CDN dependency | Medium | Unreviewed SDK changes | Pin reviewed version | Small | Fixed |
| A11Y-01 | Private mental note | Missing programmatic label | Medium | Screen-reader ambiguity | Add label/help association | Small | Fixed |
| A11Y-02 | Async errors | Generic msg helper lacked consistent alert/status roles | Medium | Errors can be missed by assistive tech | Central ARIA status/alert semantics | Small | Fixed |
| A11Y-03 | Mobile drawer | Focus could leave open drawer | Medium | Keyboard navigation confusion | Trap focus, retain Escape close | Small | Fixed |
| UX-01 | Mental consent | Sharing controls active with zero verified professionals | Medium | Misleading dead-end | Disable controls + improve empty state | Small | Fixed |
| ERR-01 | Error handling | Raw Supabase error messages are surfaced in many paths | Medium | Internal details may leak; poor UX | Map internal errors to safe user messages, log detail securely | Medium | Remaining |
| ARCH-01 | JS architecture | 366 global functions / ~10.8k lines | Medium | High regression risk | Split modules by domain | Large | Remaining |
| SEC-02 | Headers | Existing snapshot had only partial CSP/header set | Medium | Less browser containment | Expanded CSP + Permissions-Policy + cache headers | Small | Fixed, deploy verification required |
| UI-01 | User UI | Internal version badges visible | Low | Prototype feel | Remove release labels | Small | Fixed |

## Performance measurements

These are real source payload measurements, **not Lighthouse/Core Web Vitals**.

### Before v37.1
- HTML: 102.4 KiB raw / 21.7 KiB gzip
- JS: 399.4 KiB raw / 81.1 KiB gzip
- CSS: 74.8 KiB raw / 15.7 KiB gzip
- Total: 576.6 KiB raw / 118.5 KiB gzip

### After v38
- HTML: 104.2 KiB raw / 22.2 KiB gzip
- JS: 403.1 KiB raw / 82.1 KiB gzip
- CSS: 75.1 KiB raw / 15.8 KiB gzip
- Total: 582.3 KiB raw / 120.1 KiB gzip
- Versioned JS/CSS now has immutable caching.
- Scripts are deferred.
- Supabase JS is pinned.
- Existing lazy Jitsi/TUS and discovery caching are preserved.

Actual LCP, INP and CLS: **Unable to test against the deployed origin in this session.**

## Final regression

Source checks executed: **535**
Passed: **535**
Failed: **0**

JavaScript syntax: PASS
Duplicate IDs: 0
All 33 page sections preserved.

## Final recommendation

**Limited beta.**

Use synthetic/demo data and invited testers. Do not call this production-ready until the High issues are closed,
live multi-role E2E tests pass, production headers are verified, and real Lighthouse/device/browser tests are run.
