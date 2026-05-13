export function groupContractsByDebtorName(items: any[]) {
  if (!Array.isArray(items)) return [];

  const groups = new Map<string, any>();

  for (const item of items) {
    const rawName = item?.debtor_name || '';
    const normalizedName = rawName
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();

    const groupKey = normalizedName || 'SEM_NOME';

    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        isGroup: true,
        groupId: groupKey,
        debtor_name: rawName || 'Sem Nome',
        contracts: [],
        totalPrincipal: 0,
        latestCreatedAt: item?.created_at || null,
      });
    }

    const group = groups.get(groupKey);

    group.contracts.push(item);
    group.totalPrincipal += Number(item?.principal || 0);

    if (
      item?.created_at &&
      (!group.latestCreatedAt ||
        new Date(item.created_at) > new Date(group.latestCreatedAt))
    ) {
      group.latestCreatedAt = item.created_at;
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const timeA = a.latestCreatedAt
      ? new Date(a.latestCreatedAt).getTime()
      : 0;
    const timeB = b.latestCreatedAt
      ? new Date(b.latestCreatedAt).getTime()
      : 0;

    return timeB - timeA;
  });
}
