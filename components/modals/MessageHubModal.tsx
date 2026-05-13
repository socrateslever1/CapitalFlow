
import React, { useState } from 'react';
import { HandCoins, CalendarClock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Loan } from '../../types';
import { Modal } from '../ui/Modal';
import { calculateTotalDue } from '../../domain/finance/calculations';
import { getDaysDiff } from '../../utils/dateHelpers';
import { useModal } from '../../contexts/ModalContext';

import { getOrCreatePortalLink } from '../../utils/portalLink';

// Função auxiliar de saudação
const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
};

export const MessageHubModal = ({ loan, client, onClose }: { loan: Loan, client?: any, onClose: () => void }) => {
    const [loading, setLoading] = useState(false);
    const { showToast } = useModal();

    const handleSend = async (type: 'WELCOME' | 'REMINDER' | 'LATE' | 'PAID') => {
        setLoading(true);
        try {
            const portalLink = await getOrCreatePortalLink(loan.id);
            
            const firstName = (loan.debtorName || '').split(' ').filter(Boolean)[0] || 'Cliente';
            const greeting = getGreeting();

            const pendingInst = loan.installments.find(i => i.status !== 'PAID');
            
            let dateContext = '';
            let amount = '0,00';
            let daysLate = 0;

            if (pendingInst) {
                const debt = calculateTotalDue(loan, pendingInst);
                amount = debt.total.toFixed(2);
                daysLate = debt.daysLate;
                
                const dueDateObj = new Date(pendingInst.dueDate);
                const dateStr = dueDateObj.toLocaleDateString('pt-BR');
                
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
                    // Mensagem de cobrança reativa
                    text =
                      `*${greeting}, Sr(a). ${loan.debtorName}.*\n\n` +
                      `⚠️ *AVISO DE COBRANÇA*\n` +
                      `Consta em nosso sistema uma pendência de *R$ ${amount}* com vencimento original no *${dateContext}*.\n` +
                      `Por favor, regularize sua situação através do link abaixo para evitar bloqueios e multas adicionais.` +
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

            const cleanPhone = String(loan.debtorPhone || '').replace(/\D/g, '');
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
        <Modal onClose={onClose} title="Central de Mensagens">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button disabled={loading} onClick={() => handleSend('WELCOME')} className="p-4 bg-slate-950 border border-slate-800 rounded-2xl hover:border-blue-500 transition-all text-left group disabled:opacity-50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-500/10 text-blue-500 rounded-full group-hover:bg-blue-500 group-hover:text-white transition-colors"><HandCoins size={20}/></div>
                        <span className="font-bold text-white uppercase text-xs">Boas Vindas</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Envia o link de acesso direto.</p>
                </button>
                <button disabled={loading} onClick={() => handleSend('REMINDER')} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:border-amber-500 transition-all text-left group disabled:opacity-50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-amber-500/10 text-amber-500 rounded-full group-hover:bg-amber-500 group-hover:text-white transition-colors"><CalendarClock size={20}/></div>
                        <span className="font-bold text-white uppercase text-xs">Lembrete Vencimento</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Aviso suave ou do dia.</p>
                </button>
                <button disabled={loading} onClick={() => handleSend('LATE')} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:border-rose-500 transition-all text-left group disabled:opacity-50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-rose-500/10 text-rose-500 rounded-full group-hover:bg-rose-500 group-hover:text-white transition-colors"><ShieldAlert size={20}/></div>
                        <span className="font-bold text-white uppercase text-xs">Cobrança Atraso</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Mensagem firme solicitando regularização.</p>
                </button>
                <button disabled={loading} onClick={() => handleSend('PAID')} className="p-4 bg-slate-900 border border-slate-800 rounded-2xl hover:border-emerald-500 transition-all text-left group disabled:opacity-50">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-full group-hover:bg-emerald-500 group-hover:text-white transition-colors"><CheckCircle2 size={20}/></div>
                        <span className="font-bold text-white uppercase text-xs">Recibo Pagamento</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Confirmação e agradecimento.</p>
                </button>
            </div>
        </Modal>
    );
};
