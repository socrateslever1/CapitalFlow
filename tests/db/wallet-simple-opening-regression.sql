-- Executar depois da migration wallet_simple_card_opening. Todos os dados de teste recebem rollback.
begin;
do $test$
declare v_owner uuid; c uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); pos jsonb; got numeric; row_id uuid:=gen_random_uuid();
begin
 select owner_user_id into v_owner from public.personal_wallet_cards where status='ACTIVE' limit 1;
 if v_owner is null then raise exception 'Sem proprietario para teste'; end if;
 perform set_config('request.jwt.claim.sub',v_owner::text,true);
 insert into public.personal_wallet_cards(id,owner_user_id,nickname,issuer,credit_limit,used_limit,current_bill,closing_day,due_day,status)
 values(c,v_owner,'Teste temporario carga inicial','Teste',10000,0,0,26,3,'ACTIVE');
 pos:=public.personal_wallet_set_card_opening_summary(c,10000,8145.23,2517.55,date_trunc('month',current_date)::date,'OPEN',r);
 select available_limit into got from public.personal_wallet_cards where id=c;
 if got<>1854.77 then raise exception 'Limite incorreto %',got; end if;
 perform public.personal_wallet_set_card_opening_summary(c,10000,8145.23,2517.55,date_trunc('month',current_date)::date,'OPEN',r);
 insert into public.personal_wallet_statement_rows(id,owner_user_id,target_kind,target_id,document_hash,row_key,entry_date,description,amount,category)
 values(row_id,v_owner,'CARD',c,repeat('a',64),'temporary-test',current_date,'Compra ja incluida',100,'Compras');
 perform public.personal_wallet_import_card_statement_purchase(row_id,date_trunc('month',current_date)::date,true,row_id);
 perform public.personal_wallet_import_card_statement_purchase(row_id,date_trunc('month',current_date)::date,true,row_id);
 got:=private.wallet_effective_cycle_amount(v_owner,c,date_trunc('month',current_date)::date);
 if got<>2517.55 then raise exception 'PDF duplicou a carga inicial %',got; end if;
 perform public.personal_wallet_create_expense('Teste novo gasto',100,'Compras',current_date,date_trunc('month',current_date)::date,null,c,'PENDING',1,null,null);
 got:=private.wallet_effective_cycle_amount(v_owner,c,date_trunc('month',current_date)::date);
 if got<>2617.55 then raise exception 'Novo gasto nao entrou %',got; end if;
 perform public.personal_wallet_pay_invoice_partial(c,date_trunc('month',current_date)::date,null,2617.55,gen_random_uuid());
 got:=private.wallet_effective_cycle_amount(v_owner,c,date_trunc('month',current_date)::date);
 if got<>0 then raise exception 'Pagamento nao liquidou %',got; end if;
end $test$;
rollback;
