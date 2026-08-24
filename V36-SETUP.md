# MediBridge v36 — UI/UX Redesign Deployment

Frontend-only release built on stable v35.1.

## Upload/replace in GitHub
- `index.html`
- `app-v36.js`
- `style-v36.css`

Optional documentation:
- `V36-UX-UI-AUDIT.md`
- `V36-TEST-RESULTS.md`

## No backend changes
Do not run Supabase SQL.
Do not change Groq/Netlify environment variables.
Do not redeploy the MediBridge AI Edge Function for v36.

## Rollback
Restore:
- `index.html`
- `app-v35-1.js`
- `style-v35-1.css`

## Live checks after Netlify deployment
- Login / logout
- Family profile switch
- Find care + GPS + directions
- Appointments
- Emergency
- Medical Record
- Diagnostics
- Pharmacy
- Consent
- Referrals
- Notifications
- AI
- Video
- Doctor / hospital / lab / pharmacy role navigation
