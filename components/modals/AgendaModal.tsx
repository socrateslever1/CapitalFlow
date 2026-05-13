
import React from 'react';
import { Modal } from '../ui/Modal';
import CalendarView from '../../features/calendar/CalendarView';
import { UserProfile } from '../../types';
import { useToast } from '../../hooks/useToast';

interface AgendaModalProps {
    onClose: () => void;
    activeUser: UserProfile | null;
    onSystemAction: (type: string, meta: any) => void;
}

export const AgendaModal: React.FC<AgendaModalProps> = ({ onClose, activeUser, onSystemAction }) => {
    const { showToast } = useToast();

    return (
        <Modal onClose={onClose} title="Agenda">
            <CalendarView 
                activeUser={activeUser}
                showToast={showToast}
                onClose={onClose}
                onSystemAction={onSystemAction}
            />
        </Modal>
    );
};
