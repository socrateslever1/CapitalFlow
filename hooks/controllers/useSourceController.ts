import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { CapitalSource, UserProfile, SourceUIController } from '../../types';
import { parseCurrency } from '../../utils/formatters';
import { isUUID, safeUUID } from '../../utils/uuid';
import { resolveProfitBalance } from '../../utils/profitBalance';
import { normalizeWalletImageReference } from '../../utils/imageUrl';
import { clearStableFinancialRequestKey, getStableFinancialRequestKey } from '../../services/payments/paymentEngineV4';
import { generateUUID } from '../../utils/generators';

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
      const rawLogo = String(ui.sourceForm.logo_url || '').trim();
      const logoUrl = rawLogo ? normalizeWalletImageReference(rawLogo) : null;
      if (rawLogo && !logoUrl) throw new Error('Use um link HTTPS válido para a imagem da carteira.');
      const payload = {
        id,
        profile_id: ownerId,
        name: ui.sourceForm.name,
        type: ui.sourceForm.type,
        balance: initialBalance,
        logo_url: logoUrl,
        operador_permitido_id: operadorPermitido,
      };

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const { syncService } = await import('../../services/sync.service');
        await syncService.enqueueOperation({ table: 'fontes', operation: 'INSERT', data: payload, id });
        setSources([...sources, payload as any]);
        showToast('Fonte criada offline. Sera sincronizada ao reconectar.', 'success');
        ui.closeModal();
        return;
      }

      const { error } = await supabase.from('fontes').insert([payload]);

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

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      const sourceId = safeUUID(ui.activeModal.payload.id);
      if (!sourceId) {
        showToast('Fonte invalida.', 'error');
        return;
      }
      const { db } = await import('../../services/offline/adminOfflineStore');
      const { syncService } = await import('../../services/sync.service');
      const current = sources.find((s) => s.id === sourceId);
      const nextBalance = (Number(current?.balance) || 0) + amount;
      setSources(sources.map((s) => (s.id === sourceId ? { ...s, balance: nextBalance } : s)));
      await db.fontes.update(sourceId, { balance: nextBalance });
      await syncService.enqueueOperation({
        table: '__rpc',
        operation: 'RPC',
        id: crypto.randomUUID(),
        data: { fn: 'adjust_source_balance', args: { p_source_id: sourceId, p_delta: amount } }
      });
      showToast('Aporte registrado offline. Sera sincronizado ao reconectar.', 'success');
      ui.closeModal();
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
    const rawLogo = String(ui.editingSource.logo_url || '').trim();
    const logoUrl = rawLogo ? normalizeWalletImageReference(rawLogo) : null;
    if (rawLogo && !logoUrl) {
      showToast('Use um link HTTPS válido para a imagem da carteira.', 'error');
      return;
    }

    if (activeUser.id === 'DEMO') {
      setSources(sources.map((s) => (s.id === ui.editingSource?.id ? { ...s, balance: newBalance, logo_url: logoUrl || undefined } : s)));
      showToast('Carteira atualizada (Demo)', 'success');
      ui.setEditingSource(null);
      return;
    }

    const ownerId = getOwnerId(activeUser);
    if (!ownerId) {
      showToast('OwnerId inválido. Refaça login.', 'error');
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const { syncService } = await import('../../services/sync.service');
        await syncService.enqueueOperation({
          table: 'fontes',
          operation: 'UPDATE',
          data: { id: ui.editingSource.id, balance: newBalance, logo_url: logoUrl },
          id: ui.editingSource.id,
        });
        setSources(sources.map((s) => (s.id === ui.editingSource?.id ? { ...s, balance: newBalance, logo_url: logoUrl || undefined } : s)));
        showToast('Saldo atualizado offline. Sera sincronizado ao reconectar.', 'success');
        ui.setEditingSource(null);
        return;
      }
      const { error } = await supabase.from('fontes').update({
        balance: newBalance,
        logo_url: logoUrl
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
    const profitBalance = resolveProfitBalance(sources, activeUser);
    const caixaLivreSource = profitBalance.primarySource as CapitalSource | null;
    const sourceBalance = Number(caixaLivreSource?.balance) || 0;
    const availableBalance = profitBalance.balance;

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
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        const { db } = await import('../../services/offline/adminOfflineStore');
        const { syncService } = await import('../../services/sync.service');
        const nextSources = sources.map((s) => {
          if (useSourceWithdrawal && caixaLivreSource && s.id === caixaLivreSource.id) return { ...s, balance: (Number(s.balance) || 0) - amount };
          if (targetSourceId && s.id === targetSourceId) return { ...s, balance: (Number(s.balance) || 0) + amount };
          return s;
        });
        setSources(nextSources);
        if (useSourceWithdrawal && caixaLivreSource) {
          await db.fontes.update(caixaLivreSource.id, { balance: sourceBalance - amount });
        } else {
          setActiveUser({ ...activeUser, interestBalance: (Number(activeUser.interestBalance) || 0) - amount });
          await db.perfis.update(activeUser.id, { interest_balance: (Number(activeUser.interestBalance) || 0) - amount } as any);
        }
        if (targetSourceId) {
          const target = sources.find((s) => s.id === targetSourceId);
          await db.fontes.update(targetSourceId, { balance: (Number(target?.balance) || 0) + amount });
        }

        const offlineIdempotencyKey = generateUUID();
        await syncService.enqueueOperation({
          table: '__rpc',
          operation: 'RPC',
          id: offlineIdempotencyKey,
          data: {
            fn: 'withdraw_profit_atomic_v2',
            args: {
              p_idempotency_key: offlineIdempotencyKey,
              p_amount: amount,
              p_profile_id: safeUUID(ownerId),
              p_source_id: useSourceWithdrawal && caixaLivreSource ? safeUUID(caixaLivreSource.id) : null,
              p_target_source_id: targetSourceId ? safeUUID(targetSourceId) : null,
            },
          }
        });

        showToast('Resgate registrado offline. Sera sincronizado ao reconectar.', 'success');
        ui.closeModal();
        return;
      }

      const request = getStableFinancialRequestKey([
        'profit-withdrawal-v2', ownerId, caixaLivreSource?.id || 'profile',
        targetSourceId || 'external', amount.toFixed(2),
      ].join(':'));
      const { error } = await supabase.rpc('withdraw_profit_atomic_v2', {
        p_idempotency_key: request.idempotencyKey,
        p_amount: amount,
        p_profile_id: safeUUID(ownerId),
        p_source_id: useSourceWithdrawal && caixaLivreSource ? safeUUID(caixaLivreSource.id) : null,
        p_target_source_id: targetSourceId ? safeUUID(targetSourceId) : null,
      });
      if (error) throw error;
      clearStableFinancialRequestKey(request.storageKey);

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
