-- MediBridge v39.1 read-only synthetic/placeholder data review.
-- This script does not update or delete anything.
-- Review every returned UUID in the Supabase Table Editor before taking action.
-- A match is only a candidate: real names can contain these strings.

with provider_candidates as (
  select
    'account'::text as record_type,
    p.id as record_id,
    p.role::text as account_role,
    p.verification_status::text as current_status,
    p.full_name::text as display_label,
    'account name resembles placeholder data'::text as review_reason
  from public.profiles p
  where p.role in ('doctor','hospital','lab','pharmacy','mental_health')
    and coalesce(p.full_name,'') ~* '(^|[^a-z])(test|testing|demo|sample|dummy|lorem|asdf|qwerty|xxx+)([^a-z]|$)'

  union all

  select
    'doctor_profile',d.id,'doctor',p.verification_status,
    coalesce(p.full_name,'Doctor'),
    'doctor profile contains a placeholder-like professional field'
  from public.doctor_profiles d
  join public.profiles p on p.id=d.id
  where concat_ws(' ',d.specialty,d.qualification,d.medical_registration_number,d.hospital_name)
    ~* '(^|[^a-z])(test|testing|demo|sample|dummy|lorem|asdf|qwerty|xxx+)([^a-z]|$)'

  union all

  select
    'hospital_profile',h.id,'hospital',p.verification_status,
    coalesce(h.hospital_name,p.full_name,'Hospital'),
    'hospital profile contains a placeholder-like identity or address field'
  from public.hospital_profiles h
  join public.profiles p on p.id=h.id
  where concat_ws(' ',h.hospital_name,h.address,h.city,h.district)
    ~* '(^|[^a-z])(test|testing|demo|sample|dummy|lorem|asdf|qwerty|xxx+)([^a-z]|$)'

  union all

  select
    'lab_profile',l.id,'lab',p.verification_status,
    coalesce(l.lab_name,p.full_name,'Diagnostic centre'),
    'diagnostic-centre profile contains a placeholder-like field'
  from public.lab_profiles l
  join public.profiles p on p.id=l.id
  where concat_ws(' ',l.lab_name,l.registration_number,l.city,l.district)
    ~* '(^|[^a-z])(test|testing|demo|sample|dummy|lorem|asdf|qwerty|xxx+)([^a-z]|$)'

  union all

  select
    'pharmacy_profile',ph.id,'pharmacy',p.verification_status,
    coalesce(ph.pharmacy_name,p.full_name,'Pharmacy'),
    'pharmacy profile contains a placeholder-like field'
  from public.pharmacy_profiles ph
  join public.profiles p on p.id=ph.id
  where concat_ws(' ',ph.pharmacy_name,ph.drug_license_number,ph.address,ph.city,ph.district)
    ~* '(^|[^a-z])(test|testing|demo|sample|dummy|lorem|asdf|qwerty|xxx+)([^a-z]|$)'

  union all

  select
    'mental_health_provider_profile',m.id,'mental_health',p.verification_status,
    coalesce(p.full_name,'Mental-health professional'),
    'mental-health professional profile contains a placeholder-like field'
  from public.mental_health_provider_profiles m
  join public.profiles p on p.id=m.id
  where concat_ws(' ',m.qualification,m.registration_number,m.registration_body,m.clinic_name)
    ~* '(^|[^a-z])(test|testing|demo|sample|dummy|lorem|asdf|qwerty|xxx+)([^a-z]|$)'
)
select distinct
  record_type,
  record_id,
  account_role,
  current_status,
  display_label,
  review_reason
from provider_candidates
order by account_role,record_type,display_label;

-- Clinical candidate count only: this intentionally does not print health-record text.
select count(*) as consultation_rows_requiring_manual_review
from public.consultations
where concat_ws(' ',diagnosis,assessment,clinical_notes,investigations,advice)
  ~* '(^|[^a-z])(test|testing|demo|sample|dummy|lorem|asdf|qwerty|xxx+)([^a-z]|$)';
