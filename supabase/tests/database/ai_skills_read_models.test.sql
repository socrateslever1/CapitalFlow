begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

select has_function('public', 'skill_find_clients_v1', array['uuid', 'text', 'text', 'boolean']);
select has_function('public', 'skill_list_contracts_v1', array['uuid', 'uuid', 'uuid']);
select has_function('public', 'skill_get_debt_position_v1', array['uuid', 'uuid', 'date']);
select has_function('public', 'skill_list_installments_v1', array['uuid', 'uuid']);
select has_function('public', 'skill_list_due_v1', array['uuid', 'date', 'date', 'boolean', 'date']);
select has_function('public', 'skill_get_agreement_v1', array['uuid', 'uuid']);

select ok(has_function_privilege('authenticated', 'public.skill_find_clients_v1(uuid,text,text,boolean)', 'EXECUTE'), 'authenticated consulta clientes por Skill');
select ok(has_function_privilege('authenticated', 'public.skill_list_contracts_v1(uuid,uuid,uuid)', 'EXECUTE'), 'authenticated consulta contratos por Skill');
select ok(has_function_privilege('authenticated', 'public.skill_get_debt_position_v1(uuid,uuid,date)', 'EXECUTE'), 'authenticated consulta divida por Skill');
select ok(has_function_privilege('authenticated', 'public.skill_list_installments_v1(uuid,uuid)', 'EXECUTE'), 'authenticated consulta parcelas por Skill');
select ok(has_function_privilege('authenticated', 'public.skill_list_due_v1(uuid,date,date,boolean,date)', 'EXECUTE'), 'authenticated consulta vencimentos por Skill');
select ok(has_function_privilege('authenticated', 'public.skill_get_agreement_v1(uuid,uuid)', 'EXECUTE'), 'authenticated consulta acordo por Skill');

select ok(not has_function_privilege('anon', 'public.skill_find_clients_v1(uuid,text,text,boolean)', 'EXECUTE'), 'anon nao consulta clientes por Skill');
select ok(not has_function_privilege('anon', 'public.skill_list_contracts_v1(uuid,uuid,uuid)', 'EXECUTE'), 'anon nao consulta contratos por Skill');
select ok(not has_function_privilege('anon', 'public.skill_get_debt_position_v1(uuid,uuid,date)', 'EXECUTE'), 'anon nao consulta divida por Skill');
select ok(not has_function_privilege('anon', 'public.skill_list_installments_v1(uuid,uuid)', 'EXECUTE'), 'anon nao consulta parcelas por Skill');
select ok(not has_function_privilege('anon', 'public.skill_list_due_v1(uuid,date,date,boolean,date)', 'EXECUTE'), 'anon nao consulta vencimentos por Skill');
select ok(not has_function_privilege('anon', 'public.skill_get_agreement_v1(uuid,uuid)', 'EXECUTE'), 'anon nao consulta acordo por Skill');

select volatility_is('public', 'skill_find_clients_v1', array['uuid', 'text', 'text', 'boolean'], 'stable');
select volatility_is('public', 'skill_list_contracts_v1', array['uuid', 'uuid', 'uuid'], 'stable');
select volatility_is('public', 'skill_get_debt_position_v1', array['uuid', 'uuid', 'date'], 'stable');
select volatility_is('public', 'skill_list_installments_v1', array['uuid', 'uuid'], 'stable');
select volatility_is('public', 'skill_list_due_v1', array['uuid', 'date', 'date', 'boolean', 'date'], 'stable');
select volatility_is('public', 'skill_get_agreement_v1', array['uuid', 'uuid'], 'stable');

select * from finish();
rollback;
