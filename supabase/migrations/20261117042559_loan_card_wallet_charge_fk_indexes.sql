create index loan_card_wallet_charges_card_id_idx
  on public.loan_card_wallet_charges(card_id);
create index loan_card_wallet_charges_owner_user_id_idx
  on public.loan_card_wallet_charges(owner_user_id);
