# MediBridge v21.3 — Prescriptions always visible

Frontend-only refinement.

## Correct behavior

The patient's prescription is part of the medical record, so it must remain visible regardless of pharmacy location.

Location gating applies only to pharmacy discovery and pharmacy selection.

Before choosing location:
- prescription is visible
- medicines and doctor instructions are visible
- pharmacy list is not shown
- patient sees a prompt to choose city/district or GPS only if they want fulfilment

After choosing location:
- only matching pharmacies appear
- patient can select one and send the prescription

No SQL changes.
No Edge Function changes.

Deploy the unzipped v21.3 folder to Netlify.
