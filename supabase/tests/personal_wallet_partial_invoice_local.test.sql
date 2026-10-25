-- Testes em banco LOCAL exclusivamente; transacao revertida.
begin;
select plan(19);
set local session_replication_role = replica;
insert into auth.users (
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('00000000-0000-0000-0000-000000000000','41000000-0000-0000-0000-000000000001','authenticated','authenticated','partial-wallet-owner@example.test','',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','41000000-0000-0000-0000-000000000002','authenticated','authenticated','partial-wallet-other@example.test','',now(),'{}','{}',now(),now())
on conflict (id) do nothing;
set local session_replication_role = origin;
insert into public.platform_admins(user_id,role)
values ('41000000-0000-0000-0000-000000000001','SUPER_ADMIN')
on conflict (user_id) do update set role=excluded.role;
insert into public.personal_wallet_accounts(id,owner_user_id,nickname,account_type,balance)
values ('42000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Teste bancario','CHECKING',1000);
insert into public.personal_wallet_cards(id,owner_user_id,nickname,credit_limit)
values ('43000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Cartao teste',2000);
set local role authenticated;
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);

select lives_ok(
  $$select public.personal_wallet_create_expense('Lançamento legado',1000,'Outros','2026-10-01','2026-10-05',null,'43000000-0000-0000-0000-000000000001','PENDING',1,null,null)$$,
  'despesa integral permanece cadastrada'
);
select is(
  public.personal_wallet_pay_invoice_partial('43000000-0000-0000-0000-000000000001','2026-10-01',null,400,'44000000-0000-0000-0000-000000000001'),
  400::numeric,'pagamento manual parcial de 400'
);
select is((select balance from public.personal_wallet_accounts where id='42000000-0000-0000-0000-000000000001'),1000::numeric,'pagamento manual nao debita banco');
select is((select used_limit from public.personal_wallet_cards where id='43000000-0000-0000-0000-000000000001'),600::numeric,'limite liberado somente pelo montante pago');
select is((select current_bill from public.personal_wallet_cards where id='43000000-0000-0000-0000-000000000001'),600::numeric,'fatura mostra restante 600');
select is((select amount from public.personal_wallet_expense_installments limit 1),1000::numeric,'valor original da parcela nao se altera');
select is(
  public.personal_wallet_pay_invoice_partial('43000000-0000-0000-0000-000000000001','2026-10-01',null,400,'44000000-0000-0000-0000-000000000001'),
  400::numeric,'repeticao com mesmo UUID e idempotente'
);
select is((select count(*)::integer from public.personal_wallet_invoice_payments),1,'repeticao nao cria segundo registro');
select throws_ok(
  $$select public.personal_wallet_pay_invoice_partial('43000000-0000-0000-0000-000000000001','2026-10-01',null,601,'44000000-0000-0000-0000-000000000002')$$,
  'Pagamento excede o saldo restante da fatura.',
  'nao aceita pagamento acima do saldo restante'
);
select throws_ok(
  $$select public.personal_wallet_set_expense_status((select id from public.personal_wallet_expenses where description='Lançamento legado'),'CANCELED')$$,
  'Nao e possivel cancelar despesa com parcela ja paga.',
  'proibe cancelamento com pagamento parcial'
);
select lives_ok(
  $$select public.personal_wallet_create_expense('Outra compra',200,'Outros','2026-10-01','2026-10-05',null,'43000000-0000-0000-0000-000000000001','PENDING',1,null,null)$$,
  'novo gasto no mesmo mes nao apaga pagamentos'
);
select is((select current_bill from public.personal_wallet_cards where id='43000000-0000-0000-0000-000000000001'),800::numeric,'novo gasto recompõe fatura mantendo abatimento');
select is(
  public.personal_wallet_pay_invoice_partial('43000000-0000-0000-0000-000000000001','2026-10-01','42000000-0000-0000-0000-000000000001',500,'44000000-0000-0000-0000-000000000003'),
  500::numeric,'pagamento de 500 debitado da conta'
);
select is((select balance from public.personal_wallet_accounts where id='42000000-0000-0000-0000-000000000001'),500::numeric,'debitou exatamente 500 da conta');
select is(
  public.personal_wallet_pay_invoice_partial('43000000-0000-0000-0000-000000000001','2026-10-01',null,300,'44000000-0000-0000-0000-000000000004'),
  300::numeric,'quitacao dos 300 restantes'
);
select is((select current_bill from public.personal_wallet_cards where id='43000000-0000-0000-0000-000000000001'),0::numeric,'fatura quitada zera saldo restante');
select is((select count(*)::integer from public.personal_wallet_expenses where status='PAID'),2,'quitacao conclui as duas despesas sem alterar seus valores');
select set_config('request.jwt.claim.sub','41000000-0000-0000-0000-000000000002',true);
select throws_ok(
  $select public.personal_wallet_pay_invoice_partial('43000000-0000-0000-0000-000000000001','2026-10-01',null,1,'44000000-0000-0000-0000-000000000005')$,
  'Acesso nao autorizado.',
  'outro usuario nao pode pagar fatura do administrador'
);
select is((select count(*)::integer from public.personal_wallet_invoice_payments),0,'outro usuario nao visualiza historico de pagamentos');
select * from finish();
rollback;
