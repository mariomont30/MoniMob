export class MemoryStateRepository {
  constructor(state) { this.value = structuredClone(state); }
  read() { return structuredClone(this.value); }
  write(state) { this.value = structuredClone(state); return this.read(); }
}
