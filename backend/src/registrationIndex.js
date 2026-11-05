export function planRegistrationIndex(profiles) {
  const seen = new Map(), entries = [], legacy = [];
  for (const profile of profiles) {
    if (!profile.id || String(profile.id).includes('/')) throw new Error('Identificador de perfil inválido.');
    const registration = String(profile.registration || '').trim().toLowerCase();
    // Preserve older profiles whose registration cannot be requested by the
    // current self-registration form. Never invent academic numbers.
    if (!/^[a-z0-9._-]{4,64}$/.test(registration)) { legacy.push(profile.id); continue; }
    const owner = seen.get(registration);
    if (owner && owner !== profile.id) throw Object.assign(new Error('Existem matrículas duplicadas. A migração não pode continuar.'), { code: 'DUPLICATE_REGISTRATION' });
    if (!owner) entries.push({ registration, uid: profile.id });
    seen.set(registration, profile.id);
  }
  return { entries, legacy };
}
