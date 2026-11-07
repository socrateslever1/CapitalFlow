export const getCardSummaryDestination = (cardId: string) =>
  `cartoes?card=${encodeURIComponent(cardId)}`;

export const getCardsForDisplay = <T extends { id: string }>(
  cards: T[],
  requestedCardId: string | null,
) => {
  if (!requestedCardId) return cards;
  const requestedCard = cards.find(card => card.id === requestedCardId);
  return requestedCard
    ? [requestedCard, ...cards.filter(card => card.id !== requestedCardId)]
    : cards;
};
