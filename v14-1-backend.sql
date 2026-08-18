-- MediBridge v14.1: hybrid clinical retrieval
-- Run once in Supabase SQL Editor.

create or replace function public.hybrid_match_clinical_knowledge(
  query_text text,
  query_embedding extensions.vector(768),
  match_count integer default 5,
  vector_threshold double precision default 0.10
)
returns table (
  id uuid,
  title text,
  publisher text,
  source_url text,
  topic text,
  content text,
  similarity double precision,
  keyword_score double precision,
  hybrid_score double precision
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with scored as (
    select
      c.id,
      c.title,
      c.publisher,
      c.source_url,
      c.topic,
      c.content,
      1 - (c.embedding <=> query_embedding) as similarity,
      (
        case
          when lower(coalesce(c.topic, '')) = lower(trim(query_text)) then 1.00
          when length(coalesce(c.topic,'')) >= 3
               and lower(query_text) like '%' || lower(c.topic) || '%' then 0.95
          when lower(coalesce(c.topic, '')) like '%' || lower(trim(query_text)) || '%' then 0.90
          else 0
        end
        +
        case
          when length(coalesce(c.title,'')) >= 3
               and lower(query_text) like '%' || lower(c.title) || '%' then 0.75
          when lower(coalesce(c.title, '')) like '%' || lower(trim(query_text)) || '%' then 0.70
          else 0
        end
        +
        case
          when lower(coalesce(c.content, '')) like '%' || lower(trim(query_text)) || '%' then 0.40
          else 0
        end
      )::double precision as keyword_score
    from public.clinical_knowledge_chunks c
    where c.is_active = true
      and c.embedding is not null
  ),
  final as (
    select
      s.*,
      (
        greatest(s.similarity, 0) * 0.55
        +
        least(s.keyword_score, 1.5) * 0.45
      )::double precision as hybrid_score
    from scored s
    where s.similarity >= vector_threshold
       or s.keyword_score > 0
  )
  select
    f.id,
    f.title,
    f.publisher,
    f.source_url,
    f.topic,
    f.content,
    f.similarity,
    f.keyword_score,
    f.hybrid_score
  from final f
  order by
    case when f.keyword_score > 0 then 0 else 1 end,
    f.hybrid_score desc,
    f.similarity desc
  limit match_count;
$$;

grant execute on function public.hybrid_match_clinical_knowledge(
  text,
  extensions.vector,
  integer,
  double precision
) to authenticated;
