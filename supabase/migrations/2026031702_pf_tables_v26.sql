-- Script SQL V26 - Criação das Tabelas Base para Módulo "Minhas Finanças"

SET search_path = public;

-- 1. Criação Tabela: pf_accounts (Contas Bancárias / Carteiras do Usuário)
CREATE TABLE IF NOT EXISTS pf_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('CORRENTE', 'POUPANCA', 'CARTEIRA', 'INVESTIMENTO')),
    saldo NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    wallet_type VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pf_accounts_profile_id ON pf_accounts(profile_id);

-- 2. Criação Tabela: pf_transactions (Transações de Receita/Despesa/Transferência)
CREATE TABLE IF NOT EXISTS pf_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES perfis(id) ON DELETE CASCADE,
    conta_id UUID NOT NULL REFERENCES pf_accounts(id) ON DELETE CASCADE,
    
    descricao TEXT NOT NULL,
    valor NUMERIC(15, 2) NOT NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('RECEITA', 'DESPESA', 'TRANSFERENCIA')),
    
    data DATE NOT NULL,
    data_pagamento DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'CONSOLIDADO' CHECK (status IN ('CONSOLIDADO', 'PENDENTE')),
    
    categoria_id UUID,          -- Opcional (se usar sistema de cat)
    cartao_id UUID,             -- Opcional (se vinculado a um cartão futuro)
    
    installment_number INT DEFAULT 1,
    total_installments INT DEFAULT 1,
    
    is_operation_transfer BOOLEAN DEFAULT FALSE,
    operation_source_id UUID,   -- Na transferência, guarda o ID da transação correspondente (par)
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pf_trans_owner_id ON pf_transactions(owner_id);
CREATE INDEX IF NOT EXISTS idx_pf_trans_conta_id ON pf_transactions(conta_id);

-- 3. Políticas de Segurança RLS (Row Level Security)
ALTER TABLE pf_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pf_transactions ENABLE ROW LEVEL SECURITY;

-- pf_accounts: Usuarios autenticados podem ver e editar apenas suas proprias contas
DROP POLICY IF EXISTS "Usuários podem ver suas contas" ON pf_accounts;
CREATE POLICY "Usuários podem ver suas contas" 
ON pf_accounts FOR SELECT TO authenticated USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Usuários podem inserir suas contas" ON pf_accounts;
CREATE POLICY "Usuários podem inserir suas contas" 
ON pf_accounts FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());

DROP POLICY IF EXISTS "Usuários podem atualizar suas contas" ON pf_accounts;
CREATE POLICY "Usuários podem atualizar suas contas" 
ON pf_accounts FOR UPDATE TO authenticated USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Usuários podem deletar suas contas" ON pf_accounts;
CREATE POLICY "Usuários podem deletar suas contas" 
ON pf_accounts FOR DELETE TO authenticated USING (profile_id = auth.uid());

-- pf_transactions: Usuarios autenticados podem ver e editar apenas suas proprias transações
DROP POLICY IF EXISTS "Usuários podem ver suas transações" ON pf_transactions;
CREATE POLICY "Usuários podem ver suas transações" 
ON pf_transactions FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Usuários podem inserir suas transações" ON pf_transactions;
CREATE POLICY "Usuários podem inserir suas transações" 
ON pf_transactions FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Usuários podem atualizar suas transações" ON pf_transactions;
CREATE POLICY "Usuários podem atualizar suas transações" 
ON pf_transactions FOR UPDATE TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Usuários podem deletar suas transações" ON pf_transactions;
CREATE POLICY "Usuários podem deletar suas transações" 
ON pf_transactions FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- Triggers Atualizar Saldo da Conta ao Inserir/Atualizar/Deletar Transação Consolidada
CREATE OR REPLACE FUNCTION update_account_balance_on_transaction()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'CONSOLIDADO' THEN
        IF NEW.tipo = 'RECEITA' THEN
            UPDATE pf_accounts SET saldo = saldo + NEW.valor WHERE id = NEW.conta_id;
        ELSIF NEW.tipo = 'DESPESA' THEN
            UPDATE pf_accounts SET saldo = saldo - NEW.valor WHERE id = NEW.conta_id;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'CONSOLIDADO' THEN
        IF OLD.tipo = 'RECEITA' THEN
            UPDATE pf_accounts SET saldo = saldo - OLD.valor WHERE id = OLD.conta_id;
        ELSIF OLD.tipo = 'DESPESA' THEN
            UPDATE pf_accounts SET saldo = saldo + OLD.valor WHERE id = OLD.conta_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- Retira os effeitos da velha
        IF OLD.status = 'CONSOLIDADO' THEN
            IF OLD.tipo = 'RECEITA' THEN
                UPDATE pf_accounts SET saldo = saldo - OLD.valor WHERE id = OLD.conta_id;
            ELSIF OLD.tipo = 'DESPESA' THEN
                UPDATE pf_accounts SET saldo = saldo + OLD.valor WHERE id = OLD.conta_id;
            END IF;
        END IF;
        -- Aplica os effeitos da nova
        IF NEW.status = 'CONSOLIDADO' THEN
            IF NEW.tipo = 'RECEITA' THEN
                UPDATE pf_accounts SET saldo = saldo + NEW.valor WHERE id = NEW.conta_id;
            ELSIF NEW.tipo = 'DESPESA' THEN
                UPDATE pf_accounts SET saldo = saldo - NEW.valor WHERE id = NEW.conta_id;
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_account_balance ON pf_transactions;
CREATE TRIGGER trg_update_account_balance
AFTER INSERT OR UPDATE OR DELETE ON pf_transactions
FOR EACH ROW
EXECUTE FUNCTION update_account_balance_on_transaction();
