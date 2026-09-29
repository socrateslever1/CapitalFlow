create or replace function public.sync_client_to_contract()
returns trigger
language plpgsql
as $$
begin
  update public.contratos
  set
    debtor_name = new.name,
    debtor_document = new.document,
    debtor_phone = new.phone,
    debtor_address = new.address,
    cliente_foto_url = new.foto_url
  where client_id = new.id
    and (
      debtor_name is distinct from new.name or
      debtor_document is distinct from new.document or
      debtor_phone is distinct from new.phone or
      debtor_address is distinct from new.address or
      cliente_foto_url is distinct from new.foto_url
    );

  return new;
end;
$$;

drop trigger if exists trigger_sync_client_to_contract on public.clientes;
drop trigger if exists trigger_sync_client_data on public.clientes;

create trigger trigger_sync_client_to_contract
after update of name, document, phone, address, foto_url on public.clientes
for each row
when (
  old.name is distinct from new.name or
  old.document is distinct from new.document or
  old.phone is distinct from new.phone or
  old.address is distinct from new.address or
  old.foto_url is distinct from new.foto_url
)
execute function public.sync_client_to_contract();

update public.contratos c
set
  debtor_name = cli.name,
  debtor_document = cli.document,
  debtor_phone = cli.phone,
  debtor_address = cli.address,
  cliente_foto_url = cli.foto_url
from public.clientes cli
where c.client_id = cli.id
  and (
    c.debtor_name is distinct from cli.name or
    c.debtor_document is distinct from cli.document or
    c.debtor_phone is distinct from cli.phone or
    c.debtor_address is distinct from cli.address or
    c.cliente_foto_url is distinct from cli.foto_url
  );
