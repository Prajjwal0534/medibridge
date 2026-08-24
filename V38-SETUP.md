# MediBridge v38 deployment

Upload/replace:
- index.html
- app-v38.js
- style-v38.css
- _headers
- robots.txt
- sitemap.xml
- site.webmanifest

Optional:
- V38-PRODUCTION-READINESS-AUDIT.md
- V38-TEST-RESULTS.md

No Supabase SQL is required for v38.

After deploy verify:
- home/login/logout
- family switching
- Find Care + GPS/directions
- Emergency
- Mental Health
- AI Assistance
- Notifications
- all provider/admin role navigation
- /robots.txt
- /sitemap.xml
- production response headers

The CSP still contains `unsafe-inline` because the current app uses inline event handlers. Removing it safely requires the event/rendering refactor documented in the audit.
