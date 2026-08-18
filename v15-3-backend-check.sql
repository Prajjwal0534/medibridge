-- No schema changes required if v15.2-backend.sql was already run.
select to_regclass('public.patient_consultation_ai_explanations')
  as patient_consultation_ai_explanations_table;
