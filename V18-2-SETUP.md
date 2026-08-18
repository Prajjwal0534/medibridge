# MediBridge v18.2 — Reports inside the consultation workflow

## What it adds

Patient:
- link a report to an appointment while uploading
- link/change/unlink an existing report later

Doctor:
- sees patient-linked reports directly inside Appointment Details
- can open the private report while reviewing the consultation

## Setup

1. Run `v18-2-backend.sql`.
2. No Edge Function changes.
3. Deploy the unzipped v18.2 folder to Netlify.

## Test

Patient:
Reports → existing report → `Link to appointment` → choose the active appointment.

Doctor:
My Appointments → open that same appointment.

Expected:
`Linked reports & investigations` appears above Shared files and contains the report.
