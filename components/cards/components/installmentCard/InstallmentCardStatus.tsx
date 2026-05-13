
import React from 'react';

interface InstallmentCardStatusProps {
    text: string;
    colorClass: string;
}

export const InstallmentCardStatus: React.FC<InstallmentCardStatusProps> = ({ text, colorClass }) => {
    return (
        <p className={`text-[10px] font-black uppercase mt-2 mb-4 ${colorClass}`}>
            {text}
        </p>
    );
};
