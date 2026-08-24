# MediBridge v36 — Test Results

Executed source/regression checks: **494**
Passed: **494**
Failed: **0**

Checks executed against the actual v36 HTML/CSS/JavaScript source include:
- all 32 page routes preserved
- critical DOM/backend integration IDs preserved
- every inline click handler resolves to an implementation
- visible form controls have programmatic labels
- every button has an accessible name
- mobile navigation and accessibility design requirements are present
- v35 performance optimizations remain present
- security/location/family/AI safety helpers remain present

## Result
All source/regression checks passed.

## Runtime limitation
Authoritative Lighthouse, LCP, INP, CLS, VoiceOver/TalkBack and real-device GPU behaviour require the deployed Netlify origin and representative devices. Those results are not fabricated.