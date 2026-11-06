import React, { createContext, useContext } from 'react';

/** Visual privacy only. The underlying accounting data remains unchanged. */
const FinancialPrivacyContext = createContext(false);

export const FinancialPrivacyProvider: React.FC<{ hidden: boolean; children: React.ReactNode }> = ({
  hidden, children,
}) => <FinancialPrivacyContext.Provider value={hidden}>{children}</FinancialPrivacyContext.Provider>;

export const useFinancialPrivacy = () => useContext(FinancialPrivacyContext);

export const PrivateMoney: React.FC<{ value: React.ReactNode }> = ({ value }) => {
  const hidden = useFinancialPrivacy();
  return <span aria-label={hidden ? 'Valor oculto' : undefined}>
    {hidden ? 'R$ ••••' : value}
  </span>;
};
