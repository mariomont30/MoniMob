// Revalidate the stored account online. A temporary network failure preserves
// the Firebase session so the user can retry without losing the saved login.
export async function restoreVerifiedSession({ ready, currentUser, readProfile, signOut }) {
  await ready();
  const user = currentUser();
  if (!user) return null;
  try { return await readProfile(user); }
  catch (error) {
    if (error.code !== 'EMAIL_NOT_VERIFIED') throw error;
    await signOut();
    return null;
  }
}
