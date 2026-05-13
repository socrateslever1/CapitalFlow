import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { CapitalSource, UserProfile, SourceUIController } from '../../types';
import { parseCurrency } from '../../utils/formatters';
import { isUUID, safeUUID } from '../../utils/uuid';

export const useSourceController = (
  activeUser: UserProfile | null,
  ui: SourceUIController,
  sources: CapitalSource[],
  setSources: React.Dispatch<React.SetStateAction<CapitalSource[]>>,
  setActiveUser: React.Dispatch<React.SetStateAction<UserProfile | null>>,
  fetchFullData: (id: string) => Promise<void>,
  showToast: (msg: string, type?: 'success' | 'error') => void
) => {
  const getOwnerId = (u: UserProfile) => safeUUID(u.supervisor_id) || safeUUID(u.id);
  const isMissingRpcError = (error: any, fnName: string) => {
    const message = String(error?.message || '').toLowerCase();
    const details = String(error?.details || '').toLowerCase();
    const hint = String(error?.hint || '').toLowerCase();
    const fn = fnName.toLowerCase();

    return (
      error?.code === 'PGRST202' ||
      message.includes(fn) ||
      details.includes(fn) ||
      hint.includes(fn)
    );
  };

  const withdrawProfitCaixaLivreLegacy = async (
    amount: number,
    caixaLivreSource: CapitalSource,
    targetSourceId: string | null
  ) => {
    const currentSourceBalance = Number(caixaLivreSource.balance) || 0;

    const { error: withdrawError } = await supabase
      .from('fontes')
      .update({ balance: currentSourceBalance - amount })
      .eq('id', caixaLivreSource.id);

    if (withdrawError) throw withdrawError;

    if (!targetSourceId) return;

    const targetSource = sources.find((s) => s.id === targetSourceId);
    if (!targetSource) {
      throw new Error('Fonte de destino não encontrada para concluir o resgate.');
    }

    const currentTargetBalance = Number(targetSource.balance) || 0;
    const { error: depositError } = await supabase
      .from('fontes')
      .update({ balance: currentTargetBalance + amount })
      .eq('id', targetSourceId);

    if (depositError) throw depositError;
  };

  const handleSaveSource = async () => {
    if (!activeUser) return;

    if (!ui.sourceForm.name.trim()) {
      showToast('Dê um nome para a nova fonte de capital.', 'error');
      return;
    }

    if (ui.isSaving) return;

    const initialBalance = parseCurrency(ui.sourceForm.balance);

    if (activeUser.id === 'DEMO') {
      const newSource: CapitalSource = {
        id: crypto.randomUUID(),
        name: ui.sourceForm.name,
        type: ui.sourceForm.type,
        balance: initialBalance,
        profile_id: activeUser.id,
      };
      setSources([...sources, newSource]);
      showToast('Fonte criada (Demo)', 'success');
      ui.closeModal();
      return;
    }

    ui.setIsSaving(true);

    try {
      const id = crypto.randomUUID();
      const ownerId = getOwnerId(activeUser);
      if (!ownerId) throw new Error('OwnerId inválido. Refaça login.');

      const isStaff = !!activeUser.supervisor_id;

      // STAFF criando: fonte pertence ao DONO, mas pode restringir pelo operador_permitido_id
      const operadorPermitido = isStaff ? activeUser.id : (ui.sourceForm.operador_permitido_id || null);

      const { error } = await supabase.from('fontes').insert([
        {
          id,
          profile_id: ownerId, // ✅ fontes pertencem ao DONO
          name: ui.sourceForm.name,
          type: ui.sourceForm.type,
          balance: initialBalance,
          logo_url: ui.sourceForm.logo_url || null,
          operador_permitido_id: operadorPermitido,
        },
      ]);

      if (error) {
        showToast('Erro ao criar fonte: ' + error.message, 'error');
      } else {
        showToast('Fonte criada!', 'success');
        ui.closeModal();
        await fetchFullData(ownerId); // ✅ recarrega pelo DONO
      }
    } catch (e: any) {
      showToast('Erro ao criar fonte: ' + (e?.message || 'erro desconhecido'), 'error');
    } finally {
      ui.setIsSaving(false);
    }
  };

  const handleAddFunds = async () => {
    if (!activeUser || !ui.activeModal?.payload || ui.addFundsValue == null) return;

    const amount = parseCurrency(ui.addFundsValue);
    if (amount <= 0) {
      showToast('Informe um valor válido para adicionar.', 'error');
      return;
    }

    if (activeUser.id === 'DEMO') {
      setSources(
        sources.map((s) => (s.id === ui.activeModal.payload?.id ? { ...s, balance: s.balance + amount } : s))
      );
      showToast('Fundos adicionados (Demo)', 'success');
      ui.closeModal();
      return;
    }

    const ownerId = getOwnerId(activeUser);
    if (!ownerId) {
      showToast('OwnerId inválido. Refaça login.', 'error');
      return;
    }

    const { error } = await supabase.rpc('adjust_source_balance', {
      p_source_id: safeUUID(ui.activeModal.payload.id),
      p_delta: amount,
    });

    if (error) {
      showToast('Erro ao adicionar fundos: ' + error.message, 'error');
    } else {
      showToast('Saldo atualizado com segurança!', 'success');
      
      ui.closeModal();
      await fetchFullData(ownerId); // ✅ recarrega pelo DONO
    }
  };

  const handleUpdateSourceBalance = async () => {
    if (!activeUser || !ui.editingSource) return;

    const newBalance = parseCurrency(ui.editingSource.balance);
    
    if (activeUser.id === 'DEMO') {
      setSources(sources.map((s) => (s.id === ui.editingSource?.id ? { ...s, balance: newBalance } : s)));
      showToast('Saldo atualizado (Demo)', 'success');
      ui.setEditingSource(null);
      return;
    }

    const ownerId = getOwnerId(activeUser);
    if (!ownerId) {
      showToast('OwnerId inválido. Refaça login.', 'error');
      return;
    }

    try {
      const { error } = await supabase.from('fontes').update({ 
        balance: newBalance,
        logo_url: ui.editingSource.logo_url 
      }).eq('id', ui.editingSource.id);
      if (error) throw error;

      showToast('Inventário da fonte atualizado!', 'success');

      ui.setEditingSource(null);
      await fetchFullData(ownerId); // ✅ recarrega pelo DONO
    } catch (e: any) {
      showToast('Erro ao atualizar saldo: ' + (e?.message || 'erro desconhecido'), 'error');
    }
  };

  const handleWithdrawProfit = async () => {
    if (!activeUser || ui.withdrawValue == null) return;

    const amount = parseCurrency(ui.withdrawValue);

    if (amount <= 0) {
      showToast('Informe um valor válido para resgatar.', 'error');
      return;
    }

    const caixaLivreSource = sources.find(s => {
      const n = (s.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "");
      return n.includes('caixa livre') || n.includes('lucro') || n.includes('disponivel') || n.includes('balance');
    });

    const sourceBalance = Number(caixaLivreSource?.balance) || 0;
    const profileBalance = Number(activeUser.interestBalance) || 0;
    
    // 🔥 ALINHAMENTO: Prioridade para a Fonte de Caixa Livre se ela existir
    const availableBalance = caixaLivreSource ? sourceBalance : profileBalance;

    if (amount > availableBalance) {
      showToast('Saldo de lucro insuficiente.', 'error');
      return;
    }

    const normalizedWithdrawTarget = String(ui.withdrawSourceId || '').trim();
    const targetSourceId =
      !normalizedWithdrawTarget || normalizedWithdrawTarget === 'EXTERNAL_WITHDRAWAL'
        ? null
        : normalizedWithdrawTarget;

    if (targetSourceId && !sources.some((s) => s.id === targetSourceId)) {
      showToast('Selecione uma fonte válida para receber o resgate.', 'error');
      return;
    }

    if (activeUser.id === 'DEMO') {
      if (caixaLivreSource && sourceBalance >= amount) {
        setSources(sources.map((s) => {
          if (s.id === caixaLivreSource.id) return { ...s, balance: s.balance - amount };
          if (targetSourceId && s.id === targetSourceId) return { ...s, balance: s.balance + amount };
          return s;
        }));
      } else {
        setActiveUser({ ...activeUser, interestBalance: (activeUser.interestBalance || 0) - amount });
        if (targetSourceId) {
          setSources(sources.map((s) => (s.id === targetSourceId ? { ...s, balance: s.balance + amount } : s)));
        }
      }
      showToast('Resgate realizado (Demo)!', 'success');
      ui.closeModal();
      return;
    }

    const ownerId = getOwnerId(activeUser);
    if (!ownerId) {
      showToast('OwnerId inválido. Refaça login.', 'error');
      return;
    }

    try {
      const useSourceWithdrawal = caixaLivreSource && sourceBalance >= amount;

      if (useSourceWithdrawal && caixaLivreSource) {
        const { error } = await supabase.rpc('withdraw_profit_caixa_livre', {
          p_amount: amount,
          p_profile_id: safeUUID(ownerId),
          p_source_id: safeUUID(caixaLivreSource.id),
          p_target_source_id: targetSourceId ? safeUUID(targetSourceId) : null,
        });
        if (error) {
          if (isMissingRpcError(error, 'withdraw_profit_caixa_livre')) {
            await withdrawProfitCaixaLivreLegacy(amount, caixaLivreSource, targetSourceId);
          } else {
            throw error;
          }
        }
      } else {
        // Fluxo antigo ou fallback: lucro está em perfis.interest_balance
        const { error } = await supabase.rpc('profit_withdrawal_atomic', {
          p_amount: amount,
          p_profile_id: safeUUID(ownerId),
          p_target_source_id: targetSourceId ? safeUUID(targetSourceId) : null,
        });
        if (error) throw error;
      }

      // 🔥 REGISTRO DE SEGURANÇA: Garante que o resgate apareça no histórico de caixa
      // para que o recálculo de balanço não "esqueça" esse saque no futuro.
      await supabase.from('transacoes_caixa').insert([{
        profile_id: ownerId,
        tipo: 'WITHDRAWAL',
        valor: amount,
        descricao: `Resgate de Lucro${targetSourceId ? ' para fonte interna' : ' externo'}`,
        data: new Date().toISOString()
      }]);

      showToast('Resgate processado com sucesso!', 'success');

      ui.closeModal();
      await fetchFullData(ownerId);
    } catch (e: any) {
      showToast('Falha no resgate: ' + (e?.message || 'erro desconhecido'), 'error');
    }
  };

  return {
    handleSaveSource,
    handleAddFunds,
    handleUpdateSourceBalance,
    handleWithdrawProfit,
  };
};
