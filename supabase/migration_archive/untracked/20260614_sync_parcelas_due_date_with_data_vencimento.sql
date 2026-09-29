-- Mantem os dois campos de vencimento sincronizados.
-- O frontend usa data_vencimento como data oficial, mas fluxos antigos/RPCs
-- ainda leem due_date. Divergencia entre eles causa status de atraso incorreto.

update public.parcelas
set due_date = data_vencimento
where data_vencimento is not null
  and (due_date is null or due_date <> data_vencimento);
