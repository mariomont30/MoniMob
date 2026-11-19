export const entityRevision = (entity) =>
  Number.isSafeInteger(entity?.revision) && entity.revision > 0
    ? entity.revision
    : 1;

export function assertReviewVersion(
  entity,
  expectedRevision,
  requireVersion = false,
) {
  if (expectedRevision === undefined && !requireVersion) return;
  if (expectedRevision !== entityRevision(entity))
    throw Object.assign(
      new Error(
        'Este conteúdo foi atualizado. Atualize a lista e confira a versão atual antes de continuar.',
      ),
      { name: 'DomainError', code: 'REVIEW_CHANGED' },
    );
}

export function latestReview(state, entityType, entityId) {
  return state.approvals
    .filter(
      (item) => item.entityType === entityType && item.entityId === entityId,
    )
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        Number(b.item.sequence || 0) - Number(a.item.sequence || 0) ||
        String(b.item.decidedAt || '').localeCompare(
          String(a.item.decidedAt || ''),
        ) ||
        b.index - a.index,
    )[0]?.item;
}

export function monitorAdjustments(state, monitorId) {
  return [
    ...state.sessions
      .filter(
        (item) =>
          item.monitorId === monitorId &&
          !item.archived &&
          (item.status === 'adjustments_requested' ||
            item.authorizationInvalid),
      )
      .map((item) => ({ kind: 'session', item })),
    ...state.materials
      .filter(
        (item) =>
          (item.ownerId || item.monitorId) === monitorId &&
          !item.archived &&
          item.status === 'adjustments_requested',
      )
      .map((item) => ({ kind: 'material', item })),
  ].map((entry) => ({
    ...entry,
    feedback: latestReview(state, entry.kind, entry.item.id),
  }));
}
