const startsAt = (session) =>
  Date.parse(`${session.date}T${session.time}:00-03:00`);

// Keep an appointment visible while it is in progress or awaiting a new review.
// A cancelled, archived or ended session is not an upcoming commitment.
export function nextStudentAppointment(state, studentId, now = Date.now()) {
  const booked = new Set(
    state.reservations
      .filter((item) => item.studentId === studentId && item.status === 'confirmed')
      .map((item) => item.sessionId),
  );
  return state.sessions
    .filter((session) =>
      booked.has(session.id) && !session.archived &&
      ['approved', 'pending', 'adjustments_requested'].includes(session.status) &&
      startsAt(session) + Number(session.durationMinutes || 60) * 60000 > now,
    )
    .sort((a, b) => startsAt(a) - startsAt(b) || a.id.localeCompare(b.id))[0] || null;
}
