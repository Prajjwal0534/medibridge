# MediBridge v18 — Reports & Investigations Hub

This version does not depend on Gemini.

## What v18 adds

Patient:
- upload lab, imaging, pathology, cardiology or other reports
- PDF/JPG/PNG/WEBP/DOC/DOCX
- maximum 15 MB
- optional report date
- optional notes
- optionally link report to an appointment
- open/delete own uploaded reports

Doctor:
- view reports linked to their appointments
- view patient reports where active record consent allows access

Admin:
- can view accessible report metadata/files

Files are stored in the private Supabase bucket:
`Medical reports`

## Setup

### Step 1
Run:
`v18-backend.sql`

in Supabase SQL Editor.

### Step 2
No Edge Function update is required for v18.

Keep the current v17 `medibridge-ai` function as it is.

### Step 3
Deploy the unzipped v18 folder to Netlify.

## First test

Patient → Reports → Add a report

Upload a small test PDF/image and confirm it appears under `My reports`.

Then open it using `Open report`.
