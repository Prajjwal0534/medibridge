-- MediBridge v30 — Clinical Medical Book Library
-- Run once in Supabase SQL Editor.

create table if not exists public.clinical_source_documents (
  id uuid primary key default gen_random_uuid(),
  book_name text not null check (char_length(trim(book_name)) between 2 and 250),
  edition text not null check (char_length(trim(edition)) between 1 and 80),
  storage_bucket text not null default 'Clinical knowledge documents',
  storage_path text not null unique,
  original_file_name text not null,
  file_size_bytes bigint,
  mime_type text not null default 'application/pdf',
  processing_status text not null default 'uploaded'
    check (processing_status in ('uploaded','processing','ready','failed')),
  chunk_count integer not null default 0 check (chunk_count >= 0),
  error_message text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clinical_source_documents enable row level security;

drop policy if exists "Admin reads clinical source documents" on public.clinical_source_documents;
create policy "Admin reads clinical source documents"
on public.clinical_source_documents
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admin creates clinical source documents" on public.clinical_source_documents;
create policy "Admin creates clinical source documents"
on public.clinical_source_documents
for insert
to authenticated
with check (
  public.is_admin()
  and created_by=auth.uid()
);

drop policy if exists "Admin updates clinical source documents" on public.clinical_source_documents;
create policy "Admin updates clinical source documents"
on public.clinical_source_documents
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admin deletes clinical source documents" on public.clinical_source_documents;
create policy "Admin deletes clinical source documents"
on public.clinical_source_documents
for delete
to authenticated
using (public.is_admin());

create index if not exists clinical_source_documents_status_idx
on public.clinical_source_documents(processing_status,created_at desc);

create or replace function public.touch_clinical_source_document_updated_at()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists touch_clinical_source_document_updated_at_trigger
on public.clinical_source_documents;

create trigger touch_clinical_source_document_updated_at_trigger
before update on public.clinical_source_documents
for each row execute function public.touch_clinical_source_document_updated_at();

-- Private Storage bucket.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'Clinical knowledge documents',
  'Clinical knowledge documents',
  false,
  524288000,
  array['application/pdf']
)
on conflict (id) do update
set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Only verified MediBridge admins can access these source PDFs.
drop policy if exists "Admin uploads clinical books" on storage.objects;
create policy "Admin uploads clinical books"
on storage.objects
for insert
to authenticated
with check (
  bucket_id='Clinical knowledge documents'
  and public.is_admin()
);

drop policy if exists "Admin reads clinical books" on storage.objects;
create policy "Admin reads clinical books"
on storage.objects
for select
to authenticated
using (
  bucket_id='Clinical knowledge documents'
  and public.is_admin()
);

drop policy if exists "Admin updates clinical books" on storage.objects;
create policy "Admin updates clinical books"
on storage.objects
for update
to authenticated
using (
  bucket_id='Clinical knowledge documents'
  and public.is_admin()
)
with check (
  bucket_id='Clinical knowledge documents'
  and public.is_admin()
);

drop policy if exists "Admin deletes clinical books" on storage.objects;
create policy "Admin deletes clinical books"
on storage.objects
for delete
to authenticated
using (
  bucket_id='Clinical knowledge documents'
  and public.is_admin()
);
