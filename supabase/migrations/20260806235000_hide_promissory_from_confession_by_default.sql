create or replace function public.apply_legal_document_display_defaults()
returns trigger
language plpgsql
set search_path = public, extensions, pg_temp
as $$
begin
  if upper(coalesce(new.tipo, new.tipo_documento, '')) in ('CONFISSAO','CONFISSAO_DIVIDA')
     and coalesce((new.snapshot_json->>'includePromissory')::boolean, false) = false
     and new.snapshot_rendered_html is not null
     and position('data-cf-no-promissory' in new.snapshot_rendered_html) = 0 then
    new.snapshot_rendered_html := replace(
      new.snapshot_rendered_html,
      '</head>',
      '<style data-cf-no-promissory>.nota-promissoria{display:none!important}</style></head>'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_legal_document_display_defaults on public.documentos_juridicos;
create trigger trg_legal_document_display_defaults
before insert or update of snapshot_rendered_html, tipo, tipo_documento, snapshot_json
on public.documentos_juridicos
for each row execute function public.apply_legal_document_display_defaults();

update public.documentos_juridicos
set snapshot_rendered_html = replace(
  snapshot_rendered_html,
  '</head>',
  '<style data-cf-no-promissory>.nota-promissoria{display:none!important}</style></head>'
)
where upper(coalesce(tipo, tipo_documento, '')) in ('CONFISSAO','CONFISSAO_DIVIDA')
  and coalesce(status_assinatura, 'PENDENTE') <> 'ASSINADO'
  and snapshot_rendered_html is not null
  and position('data-cf-no-promissory' in snapshot_rendered_html) = 0;
