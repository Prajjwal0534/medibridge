# MediBridge v22.2 — Lab report publishing

## What this completes

Patient requests tests → lab processes → lab uploads final report → report becomes `Report Ready` → patient sees it in Diagnostics AND the existing Reports Hub.

## Lab flow

Requested → Accepted → Sample/Visit Pending → In Process → **Upload & publish report** → Report Ready → Completed

The lab cannot simply mark a report ready without a file in this v22.2 UI.

## Patient flow

When the report is published:
- `Open report` appears in My diagnostic requests
- the same report automatically appears in Patient → Reports
- existing doctor/report consent rules continue to apply

## Setup

1. Run `v22-2-backend.sql`.
2. No AI Edge Function change.
3. Deploy the unzipped v22.2 folder.
4. Create a diagnostic request and move it to In Process.
5. Lab uploads PDF/JPG/PNG/WEBP (max 15 MB).
6. Check patient Diagnostics and Reports.
