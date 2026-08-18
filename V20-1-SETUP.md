# MediBridge v20.1 — Auto-connect video consultation

This version replaces the v20 manual shared-room flow.

## Patient/doctor experience

Doctor:
1. Open an ONLINE appointment.
2. Tap `Start video consultation`.
3. Doctor sees `Calling patient…`.
4. Doctor waits.

Patient:
1. Receives an in-app `Incoming video consultation` popup anywhere in MediBridge.
2. Taps `Accept` or `Decline`.
3. On Accept, MediBridge opens the exact same embedded room automatically.

Doctor:
- receives the patient's accepted state through Supabase Realtime
- MediBridge automatically opens that same room
- no manual Join button or Refresh button is required

Actual joined/connected status is not set by button clicks.
It is updated only after Jitsi reports `videoConferenceJoined`.

## Call states

idle → calling → accepted → connecting → connected → ended

Other endings:
- declined
- missed

The doctor's unanswered-call timeout is 45 seconds in this prototype.

## Setup

1. v20 must already be installed.
2. Run `v20-1-backend.sql` in Supabase SQL Editor.
3. No AI Edge Function change is required.
4. Deploy the unzipped v20.1 folder to Netlify.
5. Sign out and sign back in on both devices once after deployment.

## Test

Use one doctor device and one patient device.

Doctor:
My Appointments → online appointment → Start video consultation.

Patient:
Stay anywhere inside MediBridge. The incoming-call popup should appear automatically.

Tap Accept.

Expected:
- patient opens embedded video
- doctor automatically opens the same embedded video
- after each browser actually joins the conference, status becomes Connecting/Connected

## Important prototype limitation

The calling workflow is controlled by MediBridge, but the embedded media provider is still the public `meet.jit.si` service.

Public Jitsi may sometimes apply moderator/authentication behavior. For a production no-friction healthcare call, use a configured/self-hosted Jitsi deployment or a contracted video API/provider and keep this MediBridge session/realtime workflow.
