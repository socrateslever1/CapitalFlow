-- Tabelas do Módulo de Finanças Pessoais

-- 1. Contas (Saldo Corrente)
create table if not exists pf_contas (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references perfis(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('CORRENTE', 'POUPANCA', 'CARTEIRA', 'INVESTIMENTO')),
  saldo numeric default 0,
  created_at timestamptz default now()
);

-- 2. Cartões de Crédito
create table if not exists pf_cartoes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references perfis(id) on delete cascade,
  nome text not null,
  limite numeric default 0,
  dia_fechamento integer,
  dia_vencimento integer,
  created_at timestamptz default now()
);

-- 3. Categorias Personalizadas
create table if not exists pf_categorias (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references perfis(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('RECEITA', 'DESPESA')),
  icone text,
  created_at timestamptz default now()
);

-- 4. Transações
create table if not exists pf_transacoes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references perfis(id) on delete cascade,
  descricao text not null,
  valor numeric not null,
  tipo text not null check (tipo in ('RECEITA', 'DESPESA', 'TRANSFERENCIA')),
  data timestamptz not null,
  
  -- Relacionamentos Opcionais
  conta_id uuid references pf_contas(id) on delete set null,
  cartao_id uuid references pf_cartoes(id) on delete set null,
  categoria_id uuid references pf_categorias(id) on delete set null,
  
  fixo boolean default false,
  status text default 'CONSOLIDADO', -- PENDENTE, CONSOLIDADO
  
  created_at timestamptz default now()
);

-- Políticas RLS (Segurança)
alter table pf_contas enable row level security;
alter table pf_cartoes enable row level security;
alter table pf_categorias enable row level security;
alter table pf_transacoes enable row level security;

create policy "Users can manage their own accounts" on pf_contas for all using (auth.uid() = profile_id);
create policy "Users can manage their own cards" on pf_cartoes for all using (auth.uid() = profile_id);
create policy "Users can manage their own categories" on pf_categorias for all using (auth.uid() = profile_id);
create policy "Users can manage their own transactions" on pf_transacoes for all using (auth.uid() = profile_id);
