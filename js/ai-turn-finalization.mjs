export function finalizeTurnUiState({
  turnId,
  clientRequestId,
  usage,
  byTurn,
  byClient,
  setBusy,
  addTokenFooter,
  loadAccountOverview,
  activatePendingTab,
}) {
  setBusy(false);
  addTokenFooter(usage);
  if (turnId) byTurn.delete(turnId);
  if (clientRequestId) byClient.delete(clientRequestId);
  void loadAccountOverview();
  activatePendingTab();
}
