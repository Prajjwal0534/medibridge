# MediBridge Connected v1

1. Run `backend-security-patch.sql` once in Supabase SQL Editor.
2. Keep the `Doctor verification` bucket private.
3. Open `index.html` while connected to the internet (Supabase JS loads from CDN).
4. Test with demo data only.

Features:
- email signup/login
- role selection at signup
- patient / doctor / hospital onboarding
- doctor private certificate upload
- profile-backed dashboard

Important: do not use real patient health information yet.


## Admin verification added in v2
- Admin nav appears only for role=admin + verified.
- Lists pending doctor applications.
- Opens private certificate using a 60-second signed URL.
- Approves or rejects doctors by updating `profiles.verification_status`.


## v4 Doctor Availability
- Availability tab appears only to verified doctor accounts.
- Doctor can add day, start/end time, slot duration, consultation type and location.
- Doctor can view and delete their own saved availability.
- Uses the `doctor_availability` table and existing RLS policies.


## v5 Patient Booking
- Patient-only Book Appointment navigation.
- Lists verified doctors.
- Reads doctor availability by selected date.
- Generates slots in Asia/Kolkata time.
- Removes already-booked overlapping slots.
- Creates appointment rows.
- My Appointments page for logged-in users.


## v6 Appointment Management
- Patient and doctor can cancel active appointments.
- Doctor can confirm, complete, cancel, or mark no-show.
- Appointment detail page.
- Patient and doctor can attach private appointment files.
- Files are private to appointment participants/admin through RLS.
- Uploader can delete their own attachment.


## v7 Consultation + Prescription
- Fix: cancelled/no-show/completed appointments cannot upload new shared files.
- Existing shared files remain viewable.
- Doctor can write clinical notes, assessment, diagnosis, investigations, advice and follow-up date.
- Doctor can add multiple prescription medicines.
- Patient can view consultation and prescription read-only.
- Save & Complete makes the consultation read-only.


## v8 Referrals + Medical Record
- Patient Medical Record page showing completed consultations and prescriptions.
- Verified doctor can create a referral from an eligible appointment.
- Patient must approve referral.
- Patient chooses which completed consultation records to share.
- Receiving verified doctor can see only explicitly shared records after approval.
- Receiving doctor can accept/decline and complete referrals.


## v9 Hospital Network + Emergency Finder
- Admin can approve/reject hospital accounts.
- Verified hospitals get Hospital Ops.
- Hospitals report emergency intake status, optional emergency/ICU bed counts and status note.
- Hospitals manage capability tags.
- Emergency page is available as a prototype hospital finder.
- Browser location can sort verified hospitals by approximate straight-line distance.
- Results clearly state they are not a substitute for emergency dispatch or clinical triage.


## v9.2 Maps + Radius Search
- Hospital profile: district + Google Maps link.
- Doctor profile: optional clinic Google Maps link.
- Emergency search radius: 10 km / 25 km / 50 km / district-wide.
- District fallback when browser geolocation is denied.
- Directions button added.
- Latitude/longitude remain optional backend fields for distance sorting.


## v9.3 Accurate distance/radius
- Replaces browser Haversine filtering with server-side PostGIS radius search.
- Invalid hospital coordinates are rejected.
- Existing impossible coordinates are cleared by migration.
- Radius mode requires GPS and returns only hospitals truly within 10/25/50 km.
- District-wide mode is explicitly separate and no longer pretends to calculate distance.
- Results are ordered by PostGIS-calculated geodesic distance.


## v9.4 Persistence display fix
- Fixes hospital profile fields appearing empty after refresh.
- Fixes patient profile fields appearing empty after refresh.
- Reloads saved profile data from Supabase whenever Profile is opened.
- Reloads server-saved values immediately after save.
- No database migration is required for this fix.


## v9.5 Automatic GPS
- Hospital latitude/longitude are no longer manually entered.
- Hospital can tap Detect current location; Save also attempts GPS automatically if no location is stored.
- Saved hospital coordinates are reloaded after refresh.
- Doctor clinic can optionally capture GPS automatically.
- Doctor clinic coordinates are stored in doctor_profiles.
- Google Maps links remain optional for opening directions.


## v9.6 Doctor location + Hospital booking
- Doctor clinic GPS is now treated like emergency hospital GPS.
- Doctor profile save automatically tries to capture clinic GPS if missing.
- Patient booking can use current location + 10/25/50 km radius for nearby verified doctors.
- Nearby doctor distance is calculated server-side with PostGIS.
- Patient booking now has Doctors and Hospitals / Clinics tabs.
- Verified hospitals appear for booking.
- Patients can request a hospital appointment with department/date/time/reason.
- Hospitals can view, confirm, reject, complete or cancel hospital appointment requests.
- Patients can cancel their own hospital appointment requests.


## v9.7 Location gate + responsive refinement
- Hospitals/clinics are no longer shown by default without a location or place/district.
- Patient must use current GPS or type a place/district first.
- Hospital results use radius when GPS is available; place text otherwise.
- Improved responsive navigation to prevent tab overlap.
- Mobile/tablet nav now scrolls horizontally instead of overlapping.
- Cleaner spacing, filter cards, empty states, and overall visual polish.


## v10 Hospital Operations
- Hospital Ops now includes appointment-request queue.
- Hospital can confirm/reject/complete/cancel appointment requests from the operations page.
- Patient can send an Emergency Arrival Notice from a hospital result.
- Arrival notice includes emergency type, ETA and optional note.
- Hospital sees active arrival notices and can acknowledge, mark arrived, close or cancel.
- Patient can view/cancel their own pending arrival notices.
- Clear safety messaging: notice is not ambulance dispatch, bed reservation, admission guarantee or treatment priority.


## v11 Consent + Record Access
- Patient can grant a verified doctor access to specific record categories.
- Consent can be time-limited or remain active until revoked.
- Patient can revoke access.
- Verified doctor dashboard shows patients who currently share records.
- Doctor can view only the categories included in active consent.
- Record accesses are logged and visible to the patient.
- Appointment file downloads for consented doctors use private signed URLs.
- This is the normal-consent foundation; emergency break-glass access is intentionally not enabled yet.


## v12 Structured Longitudinal Health Record
- Patient can maintain allergies, chronic conditions, medications, surgeries, immunizations and family history.
- Patient can record vitals such as BP, pulse, SpO2, temperature, weight and height.
- Medical Record page shows emergency summary + latest vitals + structured profile + completed consultation timeline.
- Consent system adds Structured health profile and Vitals scopes.
- Consented verified doctors can view only those structured categories explicitly allowed by the patient.
- Access to structured profile/vitals is added to the audit log.


## v13 AI Support Layer
- Adds separate Patient AI and Doctor AI interfaces.
- Patient AI can explain, prepare questions, and summarize the patient's own MediBridge data.
- Doctor AI supports general clinical reference and consent-scoped patient review.
- OpenAI API key stays only in a Supabase Edge Function secret.
- The browser never receives the OpenAI secret key.
- Patient-specific doctor context is assembled only from active consent scopes.
- RLS remains active because the Edge Function queries Supabase using the signed-in user's JWT.
- AI request metadata is logged without storing prompt or answer text.


## v14 Grounded Clinical AI
- Adds an admin-managed approved clinical knowledge base.
- Uses Gemini `gemini-embedding-001` to create 768-dimensional embeddings.
- Uses Supabase pgvector for semantic retrieval.
- Doctor AI can retrieve up to 5 relevant approved passages.
- AI is instructed to cite retrieved passages as [S1], [S2], etc.
- Source titles/publishers/links are displayed under the answer.
- Patient-specific context remains governed by the existing consent system.
- General web grounding is intentionally not enabled by default for clinical use.


## v15 Patient Doctor + AI Summary
- Completed consultations can be opened in a dual-view patient screen.
- Left side preserves the doctor's original record.
- Right side generates a patient-friendly AI explanation.
- AI explains diagnosis, medicines, investigations, advice and follow-up.
- AI is instructed to distinguish explicit doctor documentation from general medical context.
- AI must not invent why a doctor prescribed a medicine or scheduled follow-up.
