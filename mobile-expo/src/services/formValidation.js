export const normalizedEmail = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();
export function validateEmail(value) {
  const email = normalizedEmail(value);
  if (!/^[^\s@]+@(edu\.unifor\.br|unifor\.br)$/.test(email))
    throw Object.assign(
      new Error('Informe um e-mail institucional válido @edu.unifor.br ou @unifor.br.'),
      { field: 'email' },
    );
  return email;
}
export function validateRegistration(input) {
  if (!['student', 'monitor', 'professor'].includes(input.role))
    throw Object.assign(new Error('Escolha seu perfil.'), { field: 'role' });
  if (!String(input.name || '').trim() || String(input.name).trim().length > 120)
    throw Object.assign(new Error('Informe seu nome, com até 120 caracteres.'), { field: 'name' });
  if (!/^[a-z0-9._-]{4,64}$/i.test(String(input.registration || '').trim()))
    throw new Error(
      'A matrícula ou registro funcional deve ter de 4 a 64 caracteres: letras, números, ponto, hífen ou sublinhado.',
    );
  validateEmail(input.email);
  if (typeof input.password !== 'string' || input.password.length < 8 || !input.password.trim())
    throw Object.assign(new Error('A senha deve ter pelo menos 8 caracteres.'), {
      field: 'password',
    });
  if (input.confirmPassword !== undefined && input.password !== input.confirmPassword)
    throw Object.assign(new Error('A confirmação de senha deve ser igual à senha.'), {
      field: 'confirmPassword',
    });
}
export function projectDateTime(date = new Date()) {
  const shifted = new Date(date.getTime() - 3 * 3600000);
  return { date: shifted.toISOString().slice(0, 10), time: shifted.toISOString().slice(11, 16) };
}
export function validateFuture(date, time, now = Date.now()) {
  const parts = String(date).split('-').map(Number),
    calendar = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  if (
    calendar.getUTCFullYear() !== parts[0] ||
    calendar.getUTCMonth() !== parts[1] - 1 ||
    calendar.getUTCDate() !== parts[2]
  )
    throw new Error('Selecione uma data válida no calendário.');
  const value = Date.parse(`${date}T${time}:00-03:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    !Number.isFinite(value)
  )
    throw new Error('Selecione uma data e um horário válidos.');
  if (value <= now) throw new Error('Escolha uma data e um horário futuros (horário de Brasília).');
  return value;
}
