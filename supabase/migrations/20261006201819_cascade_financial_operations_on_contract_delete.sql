set search_path = public, pg_temp;

alter table public.financial_operations
  drop constraint if exists financial_operations_installment_id_fkey,
  drop constraint if exists financial_operations_loan_id_fkey;

alter table public.financial_operations
  add constraint financial_operations_installment_id_fkey
    foreign key (installment_id)
    references public.parcelas(id)
    on delete cascade,
  add constraint financial_operations_loan_id_fkey
    foreign key (loan_id)
    references public.contratos(id)
    on delete cascade;

comment on constraint financial_operations_installment_id_fkey
  on public.financial_operations is
  'Remove o registro financeiro somente quando a parcela proprietaria e excluida definitivamente.';

comment on constraint financial_operations_loan_id_fkey
  on public.financial_operations is
  'Remove o registro financeiro somente quando o contrato proprietario e excluido definitivamente.';
