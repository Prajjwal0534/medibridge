-- MediBridge v14: grounded clinical knowledge base
-- Run once in Supabase SQL Editor before deploying v14.

create extension if not exists vector with schema extensions;

create table if not exists public.clinical_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  publisher text,
  source_url text,
  topic text,
  content text not null,
  embedding extensions.vector(768),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists clinical_knowledge_active_idx
on public.clinical_knowledge_chunks(is_active);

alter table public.clinical_knowledge_chunks enable row level security;

drop policy if exists "Verified doctors can view active clinical knowledge"
on public.clinical_knowledge_chunks;

create policy "Verified doctors can view active clinical knowledge"
on public.clinical_knowledge_chunks
for select
to authenticated
using (
  is_active = true
  and public.is_verified_doctor(auth.uid())
  or public.is_admin()
);

drop policy if exists "Admins can insert clinical knowledge"
on public.clinical_knowledge_chunks;

create policy "Admins can insert clinical knowledge"
on public.clinical_knowledge_chunks
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update clinical knowledge"
on public.clinical_knowledge_chunks;

create policy "Admins can update clinical knowledge"
on public.clinical_knowledge_chunks
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete clinical knowledge"
on public.clinical_knowledge_chunks;

create policy "Admins can delete clinical knowledge"
on public.clinical_knowledge_chunks
for delete
to authenticated
using (public.is_admin());


create or replace function public.match_clinical_knowledge(
  query_embedding extensions.vector(768),
  match_count integer default 5,
  match_threshold double precision default 0.45
)
returns table (
  id uuid,
  title text,
  publisher text,
  source_url text,
  topic text,
  content text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    c.id,
    c.title,
    c.publisher,
    c.source_url,
    c.topic,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.clinical_knowledge_chunks c
  where c.is_active = true
    and c.embedding is not null
    and (1 - (c.embedding <=> query_embedding)) >= match_threshold
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_clinical_knowledge(
  extensions.vector,
  integer,
  double precision
) to authenticated;
