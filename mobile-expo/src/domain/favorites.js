export function favoriteSnapshot(session) {
  return Object.fromEntries(
    [
      'id',
      'disciplineId',
      'topic',
      'date',
      'time',
      'durationMinutes',
      'modality',
      'location',
    ]
      .filter((key) => session?.[key] !== undefined)
      .map((key) => [key, session[key]]),
  );
}

export function favoriteAvailability(session, now = Date.now()) {
  if (!session) return 'unavailable';
  if (session.archived || session.status === 'cancelled') return 'cancelled';
  if (session.status !== 'approved' || session.authorizationInvalid)
    return 'unavailable';
  const start = Date.parse(`${session.date}T${session.time}:00-03:00`);
  if (!Number.isFinite(start)) return 'unavailable';
  return start <= now ? 'ended' : 'upcoming';
}

export const favoriteLabels = {
  upcoming: 'Próxima monitoria',
  ended: 'Inscrições encerradas',
  cancelled: 'Cancelada ou arquivada',
  unavailable: 'Indisponível para reserva',
};

export function favoriteItems(state, studentId, now = Date.now()) {
  const seen = new Set();
  return state.favorites
    .filter((favorite) => {
      if (favorite.studentId !== studentId || seen.has(favorite.sessionId))
        return false;
      seen.add(favorite.sessionId);
      return true;
    })
    .map((favorite) => {
      const live = state.sessions.find(
        (session) => session.id === favorite.sessionId,
      );
      const session = live || favorite.session || favorite.snapshot;
      const availability =
        favorite.availability === 'unavailable'
          ? 'unavailable'
          : live
            ? favoriteAvailability(live, now)
            : favorite.availability || 'unavailable';
      return { ...favorite, session, availability, canOpen: Boolean(live) };
    })
    .sort(
      (a, b) =>
        Number(b.availability === 'upcoming') -
          Number(a.availability === 'upcoming') ||
        `${a.session?.date || ''}T${a.session?.time || ''}`.localeCompare(
          `${b.session?.date || ''}T${b.session?.time || ''}`,
        ),
    );
}
