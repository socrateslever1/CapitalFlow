import React from 'react';
import { DashboardAlerts } from '../../features/dashboard/DashboardAlerts';
import { DashboardControls } from './DashboardControls';

export const DashboardHeader: React.FC<any> = (props) => {
  return (
    <div className="space-y-4">
      <DashboardAlerts loans={props.loans} sources={props.sources} />
      <DashboardControls 
        statusFilter={props.statusFilter} setStatusFilter={props.setStatusFilter} 
        sortOption={props.sortOption} setSortOption={props.setSortOption} 
        searchTerm={props.searchTerm} setSearchTerm={props.setSearchTerm} 
        showToast={props.showToast} 
        isMaster={props.activeUser?.accessLevel === 'ADMIN'}
        staffMembers={props.staffMembers}
        selectedStaffId={props.selectedStaffId}
        onStaffChange={props.onStaffChange}
      />
    </div>
  );
};
