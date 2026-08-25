-- READ-ONLY MediBridge v39 authorization preflight.
-- Run after all migrations. It does not prove cross-role isolation; use the role matrix too.

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  count(p.policyname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'profiles','patient_subjects','appointments','consultations','prescription_items',
    'medical_reports','appointment_files','record_consents','record_access_requests','care_plans',
    'mental_health_appointments','mental_health_session_summaries','mental_health_private_notes',
    'mental_health_consents','mental_health_access_log','data_subject_requests',
    'family_management_authorizations','policy_acceptances','mental_health_private_note_events'
  )
group by n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
order by c.relname;

select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname in ('public','storage')
order by schemaname,tablename,policyname;

select id,name,public,file_size_limit,allowed_mime_types
from storage.buckets
where id in ('Appointment files','Medical reports','Doctor verification','Mental health verification','Clinical knowledge documents')
order by id;
