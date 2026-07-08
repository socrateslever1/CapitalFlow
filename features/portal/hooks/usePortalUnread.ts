
import { useState, useEffect } from 'react';
import { supabasePortal } from '../../../lib/supabasePortal';

export const usePortalUnread = (loanId: string | undefined, isChatOpen: boolean) => {
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!loanId || isChatOpen) {
            setUnreadCount(0);
            return;
        }

        const fetchUnread = async () => {
            const { count, error } = await supabasePortal
                .from('mensagens_suporte')
                .select('*', { count: 'exact', head: true })
                .eq('loan_id', loanId)
                .or('sender.eq.OPERATOR,sender_type.eq.OPERATOR')
                .or('read.eq.false,read.is.null');
            if (error) {
                console.warn('[usePortalUnread] Falha ao contar mensagens:', error.message);
                setUnreadCount(0);
                return;
            }
            setUnreadCount(count || 0);
        };

        fetchUnread();

        const channel = supabasePortal.channel(`portal-unread-${loanId}`)
            .on(
                'postgres_changes',
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'mensagens_suporte', 
                    filter: `loan_id=eq.${loanId}` 
                },
                (payload) => {
                    // Incrementa apenas se for do operador e chat fechado
                    if (payload.new.sender === 'OPERATOR' || payload.new.sender_type === 'OPERATOR') {
                        fetchUnread();
                    }
                }
            )
            .subscribe();

        return () => { supabasePortal.removeChannel(channel); };
    }, [loanId, isChatOpen]);

    return unreadCount;
};
