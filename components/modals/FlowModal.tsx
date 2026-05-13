import React from 'react';
import { ExtratoPage } from '../../features/finance/extrato/pages/ExtratoPage';

export const FlowModal = ({ loans }: { loans: any[] }) => {
    // FlowModal is now a thin wrapper for the official ExtratoPage
    return <ExtratoPage />;
};
