
import { useMemo } from 'react';
import { CalendarEvent } from '../types';
import { asNumber } from '../../../utils/safe';

export const useCalendarComputed = (
    events: CalendarEvent[], 
    selectedDate: Date
) => {
    const selectedStr = selectedDate.toDateString();
    
    // 1. Geração da Tira de Dias (3 antes, 3 depois)
    const dayStrip = useMemo(() => {
        const days = [];
        const start = new Date(selectedDate);
        start.setDate(start.getDate() - 3); 
        
        for(let i=0; i<7; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            days.push(d);
        }
        return days;
    }, [selectedStr]); 

    // Helper seguro para timestamp
    const safeTime = (dateStr: string) => {
        const t = new Date(dateStr).getTime();
        return isNaN(t) ? 0 : t;
    };

    // 2. Filtros de Eventos
    const urgentEvents = useMemo(() => events.filter(e => e.priority === 'URGENT'), [events]);
    const lateEvents = useMemo(() => events.filter(e => e.status === 'LATE'), [events]);
    
    const radarCount = urgentEvents.length + lateEvents.length;

    // 3. Eventos do Dia Selecionado
    const dayEvents = useMemo(() => events.filter(e => {
        if (e.priority === 'URGENT') return false; 
        if (e.status === 'LATE') return false;
        
        const t = safeTime(e.start_time);
        if (t === 0) return false;

        const d = new Date(t);
        return d.toDateString() === selectedStr;
    }).sort((a,b) => (a.priority === 'HIGH' ? -1 : 1)), [events, selectedStr]);

    // 4. Totais (com proteção numérica)
    const dayTotalReceivable = useMemo(() => 
        dayEvents.reduce((acc, e) => acc + asNumber(e.meta?.amount), 0), 
    [dayEvents]);

    return {
        dayStrip,
        urgentEvents,
        lateEvents,
        radarCount,
        dayEvents,
        dayTotalReceivable
    };
};
