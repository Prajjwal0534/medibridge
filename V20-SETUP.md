# MediBridge v20 — Online / Video Consultation Workflow

## What v20 adds

For ONLINE doctor appointments only:

Doctor:
- sees a Video consultation card
- starts the room
- joins the video room
- can open consultation notes beside the workflow
- sees whether the patient has joined
- ends the video session

Patient:
- sees Waiting for doctor before the room is started
- Join video consultation appears after the doctor starts
- sees doctor/patient join status
- can refresh/check room status

The session state is stored in Supabase.

## Prototype video provider

For testing, v20 opens an external Jitsi Meet room using a random MediBridge room name.

This is suitable only for prototype workflow testing.
Before production healthcare use, replace/review the video provider and configuration for privacy, security, consent, recording policy and applicable regulatory requirements.

## Setup

1. Run `v20-backend.sql` in Supabase SQL Editor.
2. No AI Edge Function change is required.
3. Deploy the unzipped v20 folder to Netlify.

## Test

Create or use an ONLINE appointment.

Doctor:
My Appointments → open online appointment → Start video consultation.

Patient:
Open the same appointment → Join video consultation.

The room opens in a separate browser tab.
