# MediBridge v36 — UX/UI Audit and Redesign Report

## Executive diagnosis

The working v35.1 platform has strong functional breadth, but its interface evolved feature-by-feature.
The result was a technically capable product with too many equally weighted navigation choices,
a weak public homepage hierarchy, generic dashboards, and a mobile navigation model that required
horizontal scanning.

The redesign keeps every existing route, DOM hook and backend integration, while adding a calmer
design system and a role-aware navigation shell.

## Competitive UX audit

### Practo
Current Practo prominently presents a small set of health actions such as instant video consultation,
finding nearby doctors, lab tests and in-clinic appointments. This is effective because the user can
start with a task rather than learn the product architecture.

MediBridge adopts the task-first clarity but avoids turning the homepage into many stacked specialty
promotions.

Source: https://www.practo.com/

### Apollo 24|7
Apollo communicates breadth and trust around consultations, pharmacy, diagnostics and a digital
medical vault. Its breadth validates the connected-healthcare direction, but a platform this broad
can become cognitively dense if every service receives equal prominence.

MediBridge therefore keeps breadth behind progressive disclosure and role-specific navigation.

Source: https://www.apollo247.com/

### Tata 1mg
Tata 1mg is strong at search, lab-test comparison, trust markers, certified labs and explicit
service explanations. Its marketplace pages also demonstrate how easily healthcare interfaces can
become promotion/discount dense.

MediBridge borrows clear comparison and trust patterns but keeps commercial promotion visually
secondary to suitability and care.

Sources:
- https://www.1mg.com/
- https://www.1mg.com/labs
- https://www.1mg.com/doctors/index.htm

### PharmEasy
PharmEasy clearly explains the lab-booking process and home sample collection. It also carries
ecommerce-style membership, coupon and discount density.

MediBridge adopts the short process explanation and avoids making the clinical experience feel like
a sale event.

Source: https://pharmeasy.in/diagnostics

### Amazon / Flipkart
Large consumer platforms demonstrate the value of persistent search, predictable account/order
areas, clear result lists and mobile bottom navigation. Baymard's mobile-app research also shows
that hidden category structures can make users fall back to search, and Amazon's app has documented
category-navigation friction.

MediBridge therefore uses only four role-critical mobile destinations plus More, while keeping
Emergency and Notifications visible in the header.

Sources:
- https://baymard.com/ux-benchmark/case-studies/amazon
- https://baymard.com/blog/mobile-app-ux-trends
- https://www.flipkart.com/

## Severity-ranked audit

| Severity | Problem | Location | User impact | v36 status |
|---|---|---|---|---|
| High | 22 top-level nav buttons competed equally | global `.nav` | mobile/elderly users must scan horizontally | Fixed with role-aware primary nav + More |
| High | Emergency could be visually distant in navigation | global header/nav | urgent users may spend time finding it | Fixed: persistent header Emergency action |
| High | Notifications were buried among many tabs | global nav | important care updates easy to miss | Fixed: persistent header notification control |
| High | Mobile had no stable 4–5 destination model | global responsive CSS | high cognitive load and thumb travel | Fixed: role-aware bottom navigation |
| High | Public homepage did not communicate full patient/family value | `page-home` | unclear differentiation in first 5 seconds | Fixed with patient/family-first hero |
| High | Dashboard cards were generic and non-actionable | `refreshDashboard()` | user still had to find next action elsewhere | Fixed with role-specific action cards |
| High | Muted text colour was below AA contrast for normal text | global CSS | reduced readability | Fixed using darker muted token |
| High | Several controls targeted 40px instead of 44px | global CSS | harder for elderly/motor-impaired users | Fixed globally |
| High | No skip link and no document language | `index.html` | keyboard/screen-reader friction | Fixed |
| Medium | Typography relied on Arial and inconsistent inherited AI styles | global / AI | less polished, inconsistent reading rhythm | Fixed with system type scale |
| Medium | 104 cards created excessive visual boxing | global | screens feel denser than necessary | Reduced visual weight; functionality preserved |
| Medium | Patient/provider journeys shared one crowded nav model | global | role mismatch | Fixed with role-specific nav models |
| Medium | Browser Back did not navigate SPA screens | `showPage()` | unexpected navigation behaviour | Fixed using history state |
| Medium | Technical AI language ("provider") surfaced in patient UI | `page-ai` | unnecessary implementation detail | Simplified to AI status |
| Medium | Provider forms remain long | `page-profile` | onboarding can still feel heavy | Visually improved; workflow preserved to avoid risky data-flow changes |
| Medium | Billing/receipt workflow requested in product vision is not present in current source | provider operations | cannot redesign/test a feature that does not exist | Remaining product gap |
| Medium | Dedicated mental-health privacy workflow is not present | product architecture | cannot validate stricter mental-health UX | Remaining product gap |
| Low | 36 inline style attributes remain | multiple pages | visual-maintenance inconsistency | Not removed blindly; overridden safely |
| Low | Release badges appear on some product screens | family/AI | minor implementation noise | Reduced emphasis, not fully removed |

## Journey simplification

The redesign does not remove backend steps; it removes navigation/search-for-navigation steps.

| Journey | v35.1 interaction pattern | v36 interaction pattern | Improvement |
|---|---|---|---|
| New patient | Home → create account → profile → dashboard | Home primary CTA → account → profile → dashboard | clearer single entry point |
| Find doctor/hospital | mobile horizontal nav scan → Book → location → result → slots | bottom Find care → location → result → slots | removes nav hunt |
| Appointments | mobile nav scan → appointments | bottom Appointments | one-tap destination |
| Health records | mobile nav scan → Medical Record | bottom Health records | one-tap destination |
| Family | nav scan → Family Profiles | visible family context bar / More | context remains visible |
| Emergency | find Emergency in nav → location → result → directions | persistent Emergency header → location → result → directions | urgent entry always visible |
| Notifications | find tab in crowded nav | header notification control | persistent one-tap access |
| Doctor workflow | same global nav as all roles | Dashboard / Appointments / Availability / Doctor AI | role-specific |
| Hospital workflow | crowded global nav | Dashboard / Hospital Ops / Appointments | role-specific |
| Diagnostics/pharmacy | top-level clutter | More / service tiles, still direct pages | progressive disclosure |

## Design-system summary

- Primary: #075CA8
- Text: #10243D
- Muted text: #52677D
- Background: #F5F8FC
- Success: #1F7A46
- Warning: #8A6100
- Danger/Emergency: #B42318
- 44px minimum interactive target
- 16px default body text
- system fonts only (no font download)
- 12/14/20px radius scale
- 8px-based spacing family
- reduced-motion support
- mobile bottom navigation at <=760px
- narrow-phone refinement at <=430px and <=360px

## Preserved systems

No Supabase SQL, RLS, auth, Groq, Netlify function, patient-subject/family identity,
appointment, consent, emergency-ranking, diagnostics, pharmacy, report or video backend
logic is changed by v36.

## Remaining limitations

1. Provider billing/receipts are not implemented in the current codebase.
2. A dedicated mental-health privacy module is not implemented.
3. True Lighthouse/Core Web Vitals need the deployed Netlify origin in a real browser.
4. The frontend is still a large static JavaScript application; future domain code-splitting remains valuable.
5. Real elderly/low-literacy usability testing requires representative users and cannot be simulated by source tests.
