
import React, { useMemo, useState } from 'react';
import { HandCoins, CalendarClock, ShieldAlert, CheckCircle2, UserRound, Phone, Clock3 } from 'lucide-react';
import { Installment, Loan } from '../../types';
import { Modal } from '../ui/Modal';
import { calculateTotalDue } from '../../domain/finance/calculations';
import { formatBRDate, getDaysDiff, parseDateOnlyUTC } from '../../utils/dateHelpers';
import { useModal } from '../../contexts/ModalContext';
import { isInstallmentOpen } from '../../utils/loanStatus';

import { getOrCreatePortalLink } from '../../utils/portalLink';
import { manualCollectionService } from '../../services/manualCollection.service';
import { contractsService } from '../../services/contracts.service';
import { ScopedCollectionAutomation } from '../../features/collections/components/ScopedCollectionAutomation';
import { formatMoney } from '../../utils/formatters';

// Função auxiliar de saudação
const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
};

export const MessageHubModal = ({ loan, client, onClose }: { loan: Loan, client?: any, onClose: () => void }) => {
    const [loading, setLoading] = useState(false);
    const { showToast, loans, activeUser } = useModal();

    const currentLoan = useMemo(() => (
        loans.find((item) => item.id === loan.id) || loan
    ), [loans, loan]);

    const relevantInstallment = useMemo(() => {
        const openInstallments = [...(currentLoan.installments || [])]
            .filter(isInstallmentOpen)
            .sort((a, b) => parseDateOnlyUTC(a.dueDate).getTime() - parseDateOnlyUTC(b.dueDate).getTime());
        return openInstallments.find((inst) => getDaysDiff(inst.dueDate) > 0) || openInstallments[0];
    }, [currentLoan]);
    const isOverdue = Boolean(relevantInstallment && getDaysDiff(relevantInstallment.dueDate) > 0);
    const currentDebt = useMemo(() => (
        relevantInstallment ? calculateTotalDue(currentLoan, relevantInstallment).total : 0
    ), [currentLoan, relevantInstallment]);

    const handleAutomaticCollection = async () => {
        if (!activeUser?.id) return;
        setLoading(true);
        try {
            await manualCollectionService.enqueue(activeUser.id, currentLoan.id);
            await contractsService.markAsBilled(currentLoan.id, currentLoan.billing_count || 0);
            showToast('Cobrança validada e adicionada à fila do WhatsApp.', 'success');
            onClose();
        } catch (error: any) {
            showToast(error.message || 'Não foi possível enviar a cobrança automática.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const getRelevantInstallment = (targetLoan: Loan): Installment | undefined => {
        const openInstallments = [...(targetLoan.installments || [])]
            .filter(isInstallmentOpen)
            .sort((a, b) => parseDateOnlyUTC(a.dueDate).getTime() - parseDateOnlyUTC(b.dueDate).getTime());

        if (!openInstallments.length) return undefined;

        const overdue = openInstallments.filter((inst) => getDaysDiff(inst.dueDate) > 0);
        if (overdue.length) return overdue[0];

        return openInstallments[0];
    };

    const handleAutomaticTemplate = async (type: 'WELCOME' | 'REMINDER' | 'LATE' | 'PAID') => {
        if (!activeUser?.id) return;
        setLoading(true);
        try {
            await manualCollectionService.enqueue(activeUser.id, currentLoan.id, type);
            if (type === 'REMINDER' || type === 'LATE') {
                await contractsService.markAsBilled(currentLoan.id, currentLoan.billing_count || 0);
            }
            showToast('Mensagem validada e adicionada à fila do WhatsApp.', 'success');
            onClose();
        } catch (error: any) {
            showToast(error.message || 'Não foi possível enviar a mensagem automática.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async (type: 'WELCOME' | 'REMINDER' | 'LATE' | 'PAID') => {
        setLoading(true);
        try {
            const freshLoan = loans.find((item) => item.id === loan.id) || currentLoan;
            const portalLink = await getOrCreatePortalLink(freshLoan.id);

            const firstName = (freshLoan.debtorName || '').split(' ').filter(Boolean)[0] || 'Cliente';
            const greeting = getGreeting();

            const pendingInst = getRelevantInstallment(freshLoan);

            let dateContext = '';
            let amount = '0,00';

            if (pendingInst) {
                const debt = calculateTotalDue(freshLoan, pendingInst);
                amount = debt.total.toFixed(2);

                const dateStr = formatBRDate(pendingInst.dueDate);

                // Lógica de contexto temporal para a mensagem
                const diff = getDaysDiff(pendingInst.dueDate); // >0 atrasado, 0 hoje, <0 futuro

                if (diff === 0) dateContext = `hoje (${dateStr})`;
                else if (diff > 0) dateContext = `dia ${dateStr} (há ${diff} dias)`;
                else dateContext = `dia ${dateStr}`;
            }

            // Bloco padrão de acesso via Link Seguro
            const accessBlock = `\n\n🔒 *Acesso Seguro ao Portal:*\n${portalLink}\n\n(Clique no link para ver detalhes e comprovantes)`;

            let text = '';

            switch (type) {
                case 'WELCOME':
                    const welcomeOptions = [
                        `Tudo bem? Seja muito bem-vindo(a)! Para facilitar sua gestão, liberamos seu acesso exclusivo ao nosso portal.`,
                        `É um prazer ter você conosco. Agora você pode acompanhar seus contratos com total transparência pelo link abaixo.`,
                        `Cadastro realizado com sucesso! Para sua comodidade, utilize nosso portal seguro para consultas e pagamentos.`
                    ];
                    const selectedWelcome = welcomeOptions[Math.floor(Math.random() * welcomeOptions.length)];

                    text = `*${greeting}, ${firstName}!* ${selectedWelcome}` + accessBlock;
                    break;

                case 'REMINDER':
                    // Mensagem preventiva ou do dia
                    text =
                      `*${greeting}, ${firstName}!* Tudo certo?\n\n` +
                      `Lembrete amigo: sua parcela de *R$ ${amount}* vence *${dateContext}*.\n` +
                      `Para facilitar, você pode pegar o código PIX ou enviar o comprovante direto pelo portal.` +
                      accessBlock;
                    break;

                case 'LATE':
                    text =
                      `*${greeting}, ${firstName}.*\n\n` +
                      `A parcela vencida em *${dateContext}*, com valor atualizado de *R$ ${amount}*, permanece em aberto.\n` +
                      `Precisamos do seu retorno para regularização. Você pode pagar pelo portal abaixo ou responder esta mensagem para conversar com o operador.` +
                      accessBlock;
                    break;

                case 'PAID':
                    text =
                      `*${greeting}, ${firstName}!*\n\n` +
                      `Recebemos o seu pagamento. Muito obrigado pela pontualidade!\n` +
                      `Seu recibo e o saldo atualizado já estão disponíveis no portal.` +
                      accessBlock;
                    break;
            }

            const cleanPhone = String(freshLoan.debtorPhone || '').replace(/\D/g, '');
            const waPhone = cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;

            const url = `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
            window.open(url, '_blank');
            onClose();
        } catch (error: any) {
            console.error("Erro ao gerar link do portal", error);
            showToast("Erro ao gerar link do portal. Tente novamente.", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal onClose={onClose} title="Mensagens do contrato" compact>
            <div className="space-y-3">
                <div className="rounded-lg border border-slate-800/70 bg-slate-950/45 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-black text-white">
                                <UserRound size={14} className="text-slate-500" />
                                <span className="truncate">{currentLoan.debtorName || client?.name || 'Cliente'}</span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                                <span className="flex items-center gap-1"><Phone size={11} /> {currentLoan.debtorPhone || client?.phone || 'Sem telefone'}</span>
                                {relevantInstallment && <span className="flex items-center gap-1"><Clock3 size={11} /> Vencimento {formatBRDate(relevantInstallment.dueDate)}</span>}
                            </div>
                        </div>
                        {relevantInstallment && (
                            <div className="text-right">
                                <p className={`text-[9px] font-black uppercase ${isOverdue ? 'text-rose-400' : 'text-amber-400'}`}>{isOverdue ? 'Em atraso' : 'Em aberto'}</p>
                                <p className="mt-0.5 text-sm font-black text-white">{formatMoney(currentDebt)}</p>
                            </div>
                        )}
                    </div>
                </div>

                {activeUser?.id && (
                    <ScopedCollectionAutomation
                        profileId={activeUser.id}
                        scope="LOAN"
                        scopeId={currentLoan.id}
                        label="contrato"
                        showToast={showToast}
                        compact
                    />
                )}

                <button
                    disabled={loading || !relevantInstallment}
                    onClick={handleAutomaticCollection}
                    className={`w-full rounded-lg border p-3 text-left transition-all disabled:opacity-50 ${isOverdue ? 'border-rose-500/30 bg-rose-950/20 hover:bg-rose-950/35' : 'border-amber-500/30 bg-amber-950/15 hover:bg-amber-950/30'}`}
                >
                    <div className="flex items-center gap-3">
                        <ShieldAlert size={17} className={isOverdue ? 'text-rose-400' : 'text-amber-400'} />
                        <div>
                            <p className="text-[11px] font-black uppercase text-white">Enviar cobrança agora</p>
                            <p className="mt-1 text-[10px] text-slate-400">
                                {isOverdue ? 'Contrato atrasado: será usada uma mensagem firme e respeitosa.' : 'Sem atraso: será enviado apenas um lembrete cordial.'}
                            </p>
                        </div>
                    </div>
                </button>
                <div className="flex items-center gap-3 py-1">
                    <div className="h-px flex-1 bg-slate-800" />
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Outros envios automáticos</span>
                    <div className="h-px flex-1 bg-slate-800" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                <button disabled={loading} onClick={() => handleAutomaticTemplate('WELCOME')} className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg hover:border-blue-500/60 transition-all text-left group disabled:opacity-50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-500/10 text-blue-500 rounded-full group-hover:bg-blue-500 group-hover:text-white transition-colors"><HandCoins size={20}/></div>
                        <span className="font-bold text-white uppercase text-xs">Boas Vindas</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Envia o link de acesso direto.</p>
                </button>
                <button disabled={loading} onClick={() => handleAutomaticTemplate('REMINDER')} className="p-3 bg-slate-950/35 border border-slate-800 rounded-lg hover:border-amber-500/60 transition-all text-left group disabled:opacity-50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-500/10 text-amber-500 rounded-full group-hover:bg-amber-500 group-hover:text-white transition-colors"><CalendarClock size={20}/></div>
                        <span className="font-bold text-white uppercase text-xs">Lembrete Vencimento</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Aviso suave ou do dia.</p>
                </button>
                <button disabled={loading} onClick={() => handleAutomaticTemplate('LATE')} className="p-3 bg-slate-950/35 border border-slate-800 rounded-lg hover:border-rose-500/60 transition-all text-left group disabled:opacity-50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-rose-500/10 text-rose-500 rounded-full group-hover:bg-rose-500 group-hover:text-white transition-colors"><ShieldAlert size={20}/></div>
                        <span className="font-bold text-white uppercase text-xs">Cobrança Atraso</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Mensagem firme solicitando regularização.</p>
                </button>
                <button disabled={loading} onClick={() => handleAutomaticTemplate('PAID')} className="p-3 bg-slate-950/35 border border-slate-800 rounded-lg hover:border-emerald-500/60 transition-all text-left group disabled:opacity-50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-full group-hover:bg-emerald-500 group-hover:text-white transition-colors"><CheckCircle2 size={20}/></div>
                        <span className="font-bold text-white uppercase text-xs">Recibo Pagamento</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Confirmação e agradecimento.</p>
                </button>
                </div>
            </div>
        </Modal>
    );
};
