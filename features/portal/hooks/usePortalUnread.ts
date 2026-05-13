
import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

export const usePortalUnread = (loanId: string | undefined, isChatOpen: boolean) => {
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        if (!loanId || isChatOpen) {
            setUnreadCount(0);
            return;
        }

        const fetchUnread = async () => {
            const { count } = await supabase
                .from('mensagens_suporte')
                .select('*', { count: 'exact', head: true })
                .eq('loan_id', loanId)
                .eq('sender', 'OPERATOR')
                .eq('read', false);
            setUnreadCount(count || 0);
        };

        fetchUnread();

        const channel = supabase.channel(`portal-unread-${loanId}`)
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
                    if (payload.new.sender === 'OPERATOR') {
                        fetchUnread();
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [loanId, isChatOpen]);

    return unreadCount;
};
