
import React from 'react';
import { NavHub } from './NavHub';
import { UserProfile, AppTab } from '../types';

interface NavHubControllerProps {
  ui: any;
  setActiveTab: (tab: any) => void;
  activeUser: UserProfile | null;
  hubOrder: AppTab[];
}

export const NavHubController: React.FC<NavHubControllerProps> = ({ ui, setActiveTab, activeUser, hubOrder }) => {
  const handleNavNavigate = (tab: string, modal?: string) => {
      if (modal) {
          setActiveTab(modal as any);
      } else {
          setActiveTab(tab as any);
      }
      ui.setShowNavHub(false);
  };

  if (!ui.showNavHub) return null;

  return (
    <NavHub 
        onClose={() => ui.setShowNavHub(false)} 
        onNavigate={handleNavNavigate} 
        userLevel={activeUser?.accessLevel || 'VIEWER'}
        hubOrder={hubOrder}
    />
  );
};
