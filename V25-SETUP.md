# MediBridge v25 — Unified Patient Care Timeline

## What v25 adds

A new patient-only `Care Timeline` page.

Instead of opening separate modules to understand the healthcare journey, the patient can now see one chronological timeline containing:

- consultations
- medical reports
- referrals
- diagnostic requests
- pharmacy fulfilment requests
- follow-up reminders

The timeline groups events by month and provides filters for each type.

## Timeline interactions

Consultation → opens the appointment/consultation record
Report → opens the report
Referral → opens the referral pathway
Diagnostics → opens Diagnostics
Pharmacy → opens Pharmacy
Follow-up → opens Follow-ups

## Summary

The top card shows current counts for:
- consultations
- reports
- referrals
- diagnostics
- pharmacy
- follow-ups

## Setup

No SQL changes are required for v25.

Deploy the unzipped v25 frontend and refresh/sign in.

Patient accounts will see a new `Care Timeline` navigation tab.

## Current scope

This first version is a unified view of existing MediBridge data.
It does not duplicate records or create a second medical record database.
