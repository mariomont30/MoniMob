import { createHash } from 'node:crypto';

export async function sendReminders(store, now = Date.now(), { reservationIds } = {}) {
  // Optional scope supports controlled administrative runs without touching
  // other students. The deployed scheduled function continues to process all.
  if (reservationIds !== undefined && (!Array.isArray(reservationIds) || reservationIds.some(id => typeof id !== 'string' || !id || id.includes('/')))) throw new Error('Invalid reminder reservation scope');
  const selected = reservationIds === undefined ? null : new Set(reservationIds);
  const hour = new Date(now).toISOString().slice(0, 13);
  const scope = selected ? '_' + createHash('sha256').update(JSON.stringify([...selected].sort())).digest('hex').slice(0,24) : '';
  return store.transact('reminders_' + hour + scope, hour + scope, state => {
    let sent = 0;
    for (const reservation of state.reservations.filter(item => item.status === 'confirmed' && (!selected || selected.has(item.id)))) {
      const session = state.sessions.find(item => item.id === reservation.sessionId && item.status === 'approved' && !item.archived);
      if (!session) continue;
      const start = Date.parse(session.date + 'T' + session.time + ':00-03:00');
      if (start <= now || start - now > 86400000) continue;
      const id = 'reminder-' + reservation.id + '-' + session.date + '-' + session.time.replace(':', '');
      if (state.notifications.some(item => item.id === id)) continue;
      state.notifications.push({ id, userId: reservation.studentId, sessionId: session.id, title: 'Lembrete de monitoria', body: session.topic + ' em ' + session.date + ', às ' + session.time + '.', read: false, createdAt: new Date(now).toISOString() });
      sent += 1;
    }
    return sent;
  });
}
