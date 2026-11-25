import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';

const sql = fs.readFileSync('supabase/migrations/20261124150000_wallet_edit_expense_preserve_installments.sql', 'utf8');
const body = sql.slice(sql.indexOf('create or replace function public.personal_wallet_update_expense_idempotent'));

test('edição só de texto não apaga nem recria parcelas', () => {
  assert.match(body, /v_metadata_only := round\(p_amount,2\)=round\(v_expense\.amount,2\)/);
  assert.match(body, /and p_expense_date=v_expense\.expense_date/);
  assert.match(body, /date_trunc\('month',v_due\)=date_trunc\('month',coalesce\(v_expense\.due_date,v_expense\.expense_date\)\)/);
  const early = body.indexOf('if v_metadata_only then');
  const destructive = body.indexOf('delete from public.personal_wallet_expense_installments');
  assert.ok(early > 0 && destructive > early, 'o retorno antecipado precisa vir antes da exclusão das parcelas');
  assert.match(body.slice(early, destructive), /return private\.wallet_recalculate_card_position[\s\S]*installments_preserved',true/);
});

test('recriação por mudança de valor ou data mantém a numeração original', () => {
  assert.match(body, /select coalesce\(min\(installment_number\),1\),count\(\*\) FILTER \(WHERE status<>'CANCELED'\)\s+into v_first_number,v_rebuild_count/i);
  assert.match(body, /v_first_number\+v_index-1/);
  assert.doesNotMatch(body, /values \(p_expense_id,v_user,v_index,/);
});

test('edição de compra importada 11/18 recria só as oito parcelas restantes', () => {
  const importer = fs.readFileSync('supabase/migrations/20261120033624_wallet_safe_reimport_invoice_credits.sql', 'utf8');
  assert.match(importer, /FOR v_installment_count IN p_installment_number\.\.p_installment_total LOOP/);
  assert.match(body, /count\(\*\) FILTER \(WHERE status<>'CANCELED'\)/i);
  assert.match(body, /INTO v_first_number,v_rebuild_count/i);
  assert.match(body, /v_base:=trunc\(\(round\(p_amount,2\)\*100\)\/v_rebuild_count\)/);
  assert.match(body, /FOR v_index IN 1\.\.v_rebuild_count LOOP/i);

  const importedNumbers = Array.from({ length: 18 - 11 + 1 }, (_, index) => 11 + index);
  const rebuiltNumbers = Array.from({ length: importedNumbers.length }, (_, index) => importedNumbers[0] + index);
  assert.deepEqual(rebuiltNumbers, [11, 12, 13, 14, 15, 16, 17, 18]);
});

test('mesma assinatura, permissões, idempotência e trava de limite', () => {
  assert.match(body, /p_expense_id uuid,p_description text,p_amount numeric,p_category text,\s*p_expense_date date,p_due_date date,p_notes text,p_request_id uuid/);
  assert.match(body, /security definer/);
  assert.match(body, /is_platform_super_admin\(\)/);
  assert.match(body, /mutation_requests \? p_request_id::text/);
  assert.match(body, /status='PAID' or paid_amount>0/);
  assert.match(body, /A alteração aumenta o limite excedido do cartão/);
  assert.match(body, /private\.wallet_recalculate_card_position\(v_user,v_expense\.card_id\);\s*v_previous_committed_limit:=coalesce\(\(v_position->>'committed_limit'\)::numeric,v_card\.used_limit,0\)/);
  assert.match(body, /v_position->>'committed_limit'\)::numeric > v_previous_committed_limit/);
  assert.match(sql, /grant execute on function public\.personal_wallet_update_expense_idempotent\(uuid,text,numeric,text,date,date,text,uuid\) to authenticated/);
  // A migration só redefine a função: nenhum dado existente é alterado.
  const outside = sql.replace(body.slice(0, body.indexOf('$$;') + 3), '');
  assert.doesNotMatch(outside, /\b(update|delete|insert|truncate)\b\s/i);
});
