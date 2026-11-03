import { createEmptyState } from '../data/emptyState.js';
export class AuthRepository {}

// A read cache of confirmed server data, never a local persistence substitute.
export class FirestoreStateRepository {
  constructor(loadState) { this.loadState = loadState; this.clear(); }
  clear() { this.generation = (this.generation || 0) + 1; this.value = createEmptyState(); }
  read() { return JSON.parse(JSON.stringify(this.value)); }
  async load(user, role) {
    this.clear();
    const generation = this.generation;
    const state = await this.loadState(user, role);
    if (generation !== this.generation) return null;
    this.value = state;
    return this.read();
  }
  write() {
    throw new Error('Esta operação ainda precisa de persistência segura no Firestore. Nenhuma alteração foi salva.');
  }
}
