import { COLLECTIONS, emptyState, failure, applyAction } from './academicService.js';
import { readScopedState } from './scopedFirestoreReader.js';
import { MutationQueue } from './mutationQueue.js';

// Normalized collections, serialized academic mutations and a bounded pilot dataset.
// Every writer (including the administration tool) must participate in this lock.
export class FirestoreStore {
  constructor(db) { this.db = db; this.mutations = new MutationQueue(); }
  async rateLimit(userId, kind, limit) {
    const window = Math.floor(Date.now() / 60000);
    const ref = this.db.collection('throttles').doc(userId + '_' + kind + '_' + window);
    return this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const count = snapshot.data()?.count || 0;
      if (count >= limit) throw failure('RATE_LIMIT', 'Muitas solicitações. Aguarde um minuto.', 429);
      tx.set(ref, { count: count + 1, expiresAt: new Date((window + 2) * 60000) });
    });
  }
  async load(tx) {
    const state = emptyState();
    // Audit entries are append-only. Loading historical logs for every mutation
    // needlessly consumed the daily read quota and grew with every sign-in.
    const collections = COLLECTIONS.filter(name => name !== 'auditLogs');
    let size = 0;
    const [snapshots, settings] = await Promise.all([
      Promise.all(collections.map(name => tx.get(this.db.collection(name).limit(2001)))),
      tx.get(this.db.doc('system/settings'))
    ]);
    for (const [index, name] of collections.entries()) {
      const snapshot = snapshots[index];
      if (snapshot.size > 2000 || (size += snapshot.size) > 10000) throw failure('PILOT_LIMIT', 'Limite de dados do piloto atingido. A consulta precisa ser paginada.', 503);
      state[name] = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    }
    if (settings.exists) state.settings = { ...state.settings, ...settings.data() };
    return state;
  }
  async read(identity, role) {
    if (identity) return this.db.runTransaction(tx => readScopedState(this.db, tx, identity, role), { readOnly: true });
    return this.db.runTransaction(async tx => {
      await tx.get(this.db.doc('system/academicRevision'));
      return this.load(tx);
    }, { readOnly: true });
  }
  async recordAuthEvent(commandId, fingerprint, identity, role, action) {
    return this.db.runTransaction(async tx => {
      const commandRef = this.db.doc('commands/' + commandId);
      const [previous, profile] = await Promise.all([tx.get(commandRef), tx.get(this.db.doc('users/' + identity.sub))]);
      if (previous.exists) {
        if (previous.data().fingerprint !== fingerprint) throw failure('COMMAND_CONFLICT', 'Identificador já utilizado em outra operação.', 409);
        return previous.data().result;
      }
      const state = emptyState();
      if (profile.exists) state.users.push({ ...profile.data(), id: profile.id });
      const result = applyAction(state, identity, role, action);
      for (const entry of state.auditLogs) tx.set(this.db.doc('auditLogs/' + entry.id), entry);
      tx.set(commandRef, { fingerprint, result, createdAt: new Date().toISOString() });
      return result;
    });
  }
  async transact(commandId, fingerprint, mutate) {
    return this.mutations.run(() => this.db.runTransaction(async tx => {
      const commandRef = this.db.collection('commands').doc(commandId);
      const revisionRef = this.db.doc('system/academicRevision');
      const previous = await tx.get(commandRef);
      if (previous.exists) {
        if (previous.data().fingerprint !== fingerprint) throw failure('COMMAND_CONFLICT', 'Identificador já utilizado em outra operação.', 409);
        return previous.data().result;
      }
      const revision = await tx.get(revisionRef);
      const state = await this.load(tx);
      const before = JSON.parse(JSON.stringify(state));
      const result = await mutate(state);
      const writes = [];
      for (const name of COLLECTIONS) {
        const old = new Map(before[name].map(item => [item.id, item]));
        const next = new Map(state[name].map(item => [item.id, item]));
        for (const [id, item] of next) {
          if (!/^[^/]{1,200}$/.test(id)) throw failure('INVALID_ID', 'Identificador inválido.');
          if (JSON.stringify(old.get(id)) !== JSON.stringify(item)) writes.push(() => tx.set(this.db.collection(name).doc(id), item));
        }
        for (const id of old.keys()) if (!next.has(id)) writes.push(() => tx.delete(this.db.collection(name).doc(id)));
      }
      if (writes.length > 400) throw failure('BATCH_LIMIT', 'Operação excede o limite do piloto.', 413);
      writes.forEach(write => write());
      tx.set(revisionRef, { revision: (revision.data()?.revision || 0) + 1, updatedAt: new Date().toISOString() });
      tx.set(commandRef, { fingerprint, result: JSON.parse(JSON.stringify(result ?? null)), createdAt: new Date().toISOString() });
      return result;
    }, { maxAttempts: 10 }));
  }
}
