begin;

select plan(9);

set local session_replication_role = replica;
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'wallet-owner@example.test', '', now(), '{}', '{}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'wallet-other@example.test', '', now(), '{}', '{}', now(), now())
on conflict (id) do nothing;
set local session_replication_role = origin;

insert into public.platform_admins (user_id, role)
values ('10000000-0000-0000-0000-000000000001', 'SUPER_ADMIN')
on conflict (user_id) do update set role = excluded.role;

insert into public.personal_wallet_accounts (id, owner_user_id, nickname, account_type, balance)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Conta teste', 'CHECKING', 1000);

insert into public.personal_wallet_cards (id, owner_user_id, nickname, credit_limit)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Cartao teste', 2000);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok(
  $$select public.personal_wallet_create_expense('Conta paga', 300, 'Casa', '2026-10-05', null, '20000000-0000-0000-0000-000000000001', null, 'PAID', 1, null, null)$$,
  'despesa paga em conta e criada atomicamente'
);

select is(
  (select balance from public.personal_wallet_accounts where id = '20000000-0000-0000-0000-000000000001'),
  700::numeric,
  'despesa paga reduz o saldo da conta'
);

select lives_ok(
  $$select public.personal_wallet_create_expense('Compra parcelada', 300, 'Compras', '2026-10-05', '2026-10-10', null, '30000000-0000-0000-0000-000000000001', 'PENDING', 3, null, null)$$,
  'compra parcelada no cartao e criada atomicamente'
);

select is(
  (select used_limit from public.personal_wallet_cards where id = '30000000-0000-0000-0000-000000000001'),
  300::numeric,
  'compra aumenta o limite utilizado'
);

select is(
  (select count(*)::integer from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id = i.expense_id where e.card_id = '30000000-0000-0000-0000-000000000001'),
  3,
  'parcelamento gera todas as parcelas'
);

select is(
  (select sum(i.amount) from public.personal_wallet_expense_installments i join public.personal_wallet_expenses e on e.id = i.expense_id where e.card_id = '30000000-0000-0000-0000-000000000001'),
  300::numeric,
  'soma das parcelas fecha com o valor total'
);

select is(
  public.personal_wallet_pay_invoice('30000000-0000-0000-0000-000000000001', '2026-10-01', '20000000-0000-0000-0000-000000000001'),
  100::numeric,
  'pagamento quita somente a fatura do mes'
);

select is(
  (select balance from public.personal_wallet_accounts where id = '20000000-0000-0000-0000-000000000001'),
  600::numeric,
  'pagamento da fatura reduz a conta escolhida'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.personal_wallet_create_expense('Acesso indevido', 10, 'Teste', '2026-10-05', null, '20000000-0000-0000-0000-000000000001', null, 'PENDING', 1, null, null)$$,
  'Acesso nao autorizado.',
  'usuario sem SUPER_ADMIN nao acessa a carteira pessoal'
);

select * from finish();
rollback;
