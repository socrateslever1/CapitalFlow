export function dedupeByLoanId(items: any[]) {
    const map = new Map();
    for (const item of items) {
        if (!item.loanId) {
            map.set(item.id || Math.random(), item);
            continue;
        }
        if (!map.has(item.loanId)) {
            map.set(item.loanId, { ...item });
        } else {
            const existing = map.get(item.loanId);
            // Merge unread count
            existing.unreadCount = (existing.unreadCount || 0) + (item.unreadCount || 0);
            
            // Keep newest timestamp and message
            const timeExisting = existing.timestamp ? new Date(existing.timestamp).getTime() : 0;
            const timeNew = item.timestamp ? new Date(item.timestamp).getTime() : 0;
            
            if (timeNew > timeExisting) {
                existing.timestamp = item.timestamp;
                existing.lastMessage = item.lastMessage;
            }
        }
    }
    return Array.from(map.values());
}

export function groupContractsByDebtorName(items: any[]) {
    const deduped = dedupeByLoanId(items);
    const groups = new Map<string, any>();

    for (const item of deduped) {
        if (item.type !== 'ACTIVE' && item.type !== 'CLIENT') {
            const key = item.id || Math.random().toString();
            groups.set(key, { isGroup: false, ...item });
            continue;
        }

        let rawName = item.clientName || '';
        let normalizedName = rawName.trim().replace(/\s+/g, ' ').toUpperCase();
        if (!normalizedName) {
            normalizedName = 'SEM NOME';
            rawName = 'Sem Nome';
        }

        if (!groups.has(normalizedName)) {
            groups.set(normalizedName, {
                isGroup: true,
                groupId: normalizedName,
                clientName: rawName,
                items: [],
                unreadCount: 0,
                timestamp: item.timestamp || '',
                type: item.type
            });
        }

        const group = groups.get(normalizedName);
        group.items.push(item);
        group.unreadCount += (item.unreadCount || 0);
        
        if (item.timestamp) {
            if (!group.timestamp || new Date(item.timestamp) > new Date(group.timestamp)) {
                group.timestamp = item.timestamp;
            }
        }
    }

    return Array.from(groups.values()).sort((a, b) => {
        const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return timeB - timeA;
    });
}
