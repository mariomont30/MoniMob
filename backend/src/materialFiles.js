import { createHash } from 'node:crypto';
import { saveAcademicMaterial } from './domain/workflow.js';
const MAX_SIZE = 5 * 1024 * 1024,
  PART_SIZE = 256 * 1024;
const failure = (message, code = 'INVALID_FILE', status = 400) =>
  Object.assign(new Error(message), {
    code,
    status,
  });
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const types = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
export function validateMaterialFile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw failure('Dados do arquivo inválidos.');
  const name = String(input.name || '').trim();
  if (!name || name.length > 180 || /[\\/\x00-\x1f\x7f]/.test(name))
    throw failure('Nome de arquivo inválido.');
  const extension = name.split('.').at(-1).toLowerCase(),
    mimeType = types[extension];
  if (!mimeType)
    throw failure(
      'Use PDF, PNG, JPG, TXT, DOCX, PPTX ou XLSX.',
      'FILE_TYPE_UNSUPPORTED',
      415,
    );
  if (
    typeof input.data !== 'string' ||
    !input.data ||
    input.data.length > Math.ceil(MAX_SIZE / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(input.data)
  )
    throw failure(
      'Arquivo vazio, inválido ou maior que 5 MB.',
      'FILE_TOO_LARGE',
      413,
    );
  const bytes = Buffer.from(input.data, 'base64');
  if (
    !bytes.length ||
    bytes.length > MAX_SIZE ||
    bytes.toString('base64') !== input.data
  )
    throw failure('Arquivo inválido ou maior que 5 MB.', 'FILE_TOO_LARGE', 413);
  const valid =
    extension === 'pdf'
      ? bytes.subarray(0, 5).toString() === '%PDF-'
      : extension === 'png'
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : ['jpg', 'jpeg'].includes(extension)
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : extension === 'txt'
            ? !bytes.includes(0) &&
              Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes)
            : bytes[0] === 80 &&
              bytes[1] === 75 &&
              bytes[2] === 3 &&
              bytes[3] === 4;
  if (!valid)
    throw failure(
      'O conteúdo não corresponde ao tipo de arquivo.',
      'FILE_TYPE_MISMATCH',
      415,
    );
  return {
    name,
    bytes,
    size: bytes.length,
    mimeType,
    sha256: digest(bytes),
  };
}
export class FirestoreFileStore {
  constructor(db) {
    this.db = db;
  }
  async put(id, file, ownerId, disciplineId) {
    const ref = this.db.doc('materialFiles/' + id);
    return this.db.runTransaction(async (tx) => {
      const prior = await tx.get(ref);
      if (prior.exists) {
        if (
          prior.data().sha256 !== file.sha256 ||
          prior.data().ownerId !== ownerId ||
          prior.data().disciplineId !== disciplineId
        )
          throw failure(
            'A operação já foi usada para outro arquivo.',
            'COMMAND_CONFLICT',
            409,
          );
        return prior.data();
      }
      const parts = Math.ceil(file.size / PART_SIZE),
        meta = {
          id,
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
          sha256: file.sha256,
          ownerId,
          disciplineId,
          parts,
          status: 'staged',
          createdAt: new Date().toISOString(),
        };
      for (let i = 0; i < parts; i++)
        tx.set(ref.collection('parts').doc(String(i).padStart(3, '0')), {
          data: file.bytes.subarray(i * PART_SIZE, (i + 1) * PART_SIZE),
        });
      tx.set(ref, meta);
      return meta;
    });
  }
  async linked(id, materialId) {
    await this.db.doc('materialFiles/' + id).update({
      status: 'linked',
      materialId,
    });
  }
  async read(id) {
    const ref = this.db.doc('materialFiles/' + id),
      snapshot = await ref.get();
    if (!snapshot.exists)
      throw failure('Arquivo indisponível.', 'FILE_NOT_FOUND', 404);
    const meta = snapshot.data();
    if (
      !Number.isInteger(meta.parts) ||
      meta.parts < 1 ||
      meta.parts > Math.ceil(MAX_SIZE / PART_SIZE)
    )
      throw failure('Arquivo indisponível.', 'FILE_INCOMPLETE', 503);
    const parts = await this.db.getAll(
      ...Array.from(
        {
          length: meta.parts,
        },
        (_, i) => ref.collection('parts').doc(String(i).padStart(3, '0')),
      ),
    );
    if (parts.some((x) => !x.exists))
      throw failure(
        'O arquivo não pôde ser recuperado por completo.',
        'FILE_INCOMPLETE',
        503,
      );
    const bytes = Buffer.concat(parts.map((x) => Buffer.from(x.data().data)));
    if (bytes.length !== meta.size || digest(bytes) !== meta.sha256)
      throw failure(
        'A integridade do arquivo não pôde ser confirmada.',
        'FILE_INCOMPLETE',
        503,
      );
    return {
      ...meta,
      bytes,
    };
  }
  async remove(id) {
    const ref = this.db.doc('materialFiles/' + id),
      snapshot = await ref.get();
    if (!snapshot.exists) return;
    const batch = this.db.batch();
    const parts = await ref.collection('parts').get();
    parts.docs.forEach((doc) => batch.delete(doc.ref));
    batch.delete(ref);
    await batch.commit();
  }
}
export class MaterialFileService {
  constructor({ db, academicService, fileStore = new FirestoreFileStore(db) }) {
    Object.assign(this, {
      db,
      academicService,
      fileStore,
    });
    this.pending = true;
    this.supersededPending = true;
  }
  async upload(identity, role, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw failure('Dados do envio inválidos.');
    if (!['monitor', 'professor'].includes(role))
      throw failure('Este perfil não pode enviar arquivos.', 'FORBIDDEN', 403);
    if (!/^[A-Za-z0-9_-]{12,100}$/.test(input.operationId || ''))
      throw failure('Identificador de envio inválido.', 'COMMAND_REQUIRED');
    const file = validateMaterialFile(input),
      id = digest(Buffer.from(identity.sub + ':' + input.operationId));
    const material = {
      id: input.materialId || undefined,
      disciplineId: String(input.disciplineId || ''),
      title: input.title,
    };
    if (input.expectedRevision !== undefined)
      material.expectedRevision = input.expectedRevision;
    // Validate using the scoped view before storing bytes. The authoritative
    // transaction repeats the permission check against the latest assignment.
    const preview = await this.academicService.read(identity, role);
    const fingerprint = digest(
      Buffer.from(JSON.stringify([role, material, file.sha256, file.name])),
    );
    const commandId = identity.sub + '_file_' + input.operationId;
    const cached = await this.db.doc('commands/' + commandId).get();
    if (cached.exists) {
      if (cached.data().fingerprint !== fingerprint)
        throw failure(
          'A operação já foi usada para outro envio.',
          'COMMAND_CONFLICT',
          409,
        );
      const prior = cached.data().result;
      if (
        !preview.materials.some(
          (item) =>
            item.id === prior.id &&
            item.fileId === id &&
            item.status !== 'deleted',
        )
      )
        throw failure(
          'Este envio já foi substituído ou excluído. Atualize a lista.',
          'MATERIAL_DELETED',
          409,
        );
      return { result: prior };
    }
    saveAcademicMaterial(preview, identity, role, material, {
      ...file,
      id,
    });
    await this.fileStore.put(id, file, identity.sub, material.disciplineId);
    const saved = await this.academicService.store.transact(
      commandId,
      fingerprint,
      (state) =>
        saveAcademicMaterial(state, identity, role, material, {
          ...file,
          id,
        }),
    );
    const current = await this.db.doc('materials/' + saved.id).get();
    if (
      !current.exists ||
      current.data().status === 'deleted' ||
      current.data().fileId !== id
    )
      throw failure(
        'Este envio já foi encerrado. Crie uma nova operação.',
        'MATERIAL_DELETED',
        409,
      );
    try {
      await this.fileStore.linked(id, saved.id);
    } catch {
      /* Staged recovery resolves a committed upload. */
    }
    if (saved.fileCleanupPending) {
      this.supersededPending = true;
      try {
        await this.purgeSuperseded(saved.id);
      } catch {
        /* Recovery retries obsolete bytes; current content is already protected. */
      }
    }
    return {
      result: saved,
    };
  }
  async download(identity, role, materialId) {
    const state = await this.academicService.read(identity, role),
      material = state.materials.find((x) => x.id === materialId);
    if (
      !material ||
      material.status === 'deleted' ||
      material.deletedAt ||
      !material.fileId ||
      material.archived ||
      (role === 'student' && material.status !== 'approved')
    )
      throw failure(
        'Material indisponível para este perfil.',
        'FORBIDDEN',
        403,
      );
    const file = await this.fileStore.read(material.fileId);
    if (
      file.disciplineId !== material.disciplineId ||
      file.ownerId !==
        (material.ownerId || material.monitorId || material.professorId)
    )
      throw failure('Material indisponível.', 'FORBIDDEN', 403);
    return file;
  }
  async deleteMaterial(identity, role, command) {
    const saved = await this.academicService.execute(identity, role, command);
    if (saved.fileId) {
      this.pending = true;
      try {
        await this.purge(saved.id, saved.fileId);
        return {
          ...saved,
          storageDeletionPending: false,
        };
      } catch {
        /* Access is already revoked; recovery removes bytes later. */
      }
    }
    return saved;
  }
  async purge(materialId, fileId) {
    const ref = this.db.doc('materials/' + materialId);
    const snapshot = await ref.get();
    if (
      !snapshot.exists ||
      snapshot.data().status !== 'deleted' ||
      snapshot.data().fileId !== fileId
    )
      return;
    await this.fileStore.remove(fileId);
    await this.db.runTransaction(async (tx) => {
      const revision = this.db.doc('system/academicRevision'),
        [material, lock] = await Promise.all([tx.get(ref), tx.get(revision)]);
      if (
        !material.exists ||
        material.data().status !== 'deleted' ||
        material.data().fileId !== fileId
      )
        return;
      const data = material.data();
      delete data.fileId;
      data.storageDeletionPending = false;
      data.fileDeletedAt = new Date().toISOString();
      tx.set(ref, data);
      tx.set(revision, {
        revision: (lock.data()?.revision || 0) + 1,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  async recover() {
    if (this.supersededPending) {
      const obsolete = await this.db
        .collection('materials')
        .where('fileCleanupPending', '==', true)
        .limit(20)
        .get();
      let failed = false;
      for (const doc of obsolete.docs) {
        try {
          await this.purgeSuperseded(doc.id);
        } catch {
          failed = true;
        }
      }
      this.supersededPending = failed || obsolete.size === 20;
    }
    if (this.pending) {
      const pending = await this.db
        .collection('materials')
        .where('storageDeletionPending', '==', true)
        .limit(20)
        .get();
      let failed = false;
      for (const doc of pending.docs) {
        try {
          await this.purge(doc.id, doc.data().fileId);
        } catch {
          failed = true;
        }
      }
      this.pending = failed || pending.size === 20;
    }
    const staged = await this.db
      .collection('materialFiles')
      .where('status', '==', 'staged')
      .limit(20)
      .get();
    for (const doc of staged.docs) {
      const records = await this.db
        .collection('materials')
        .where('fileId', '==', doc.id)
        .limit(1)
        .get();
      if (!records.empty) {
        if (records.docs[0].data().status === 'deleted')
          await this.purge(records.docs[0].id, doc.id);
        else await this.fileStore.linked(doc.id, records.docs[0].id);
      } else if (Date.now() - Date.parse(doc.data().createdAt) > 3600000)
        await this.fileStore.remove(doc.id);
    }
  }
  async purgeSuperseded(materialId) {
    const ref = this.db.doc('materials/' + materialId);
    const snapshot = await ref.get();
    if (!snapshot.exists) return;
    const data = snapshot.data();
    const obsolete = (data.obsoleteFileIds || []).filter(
      (id) => id !== data.fileId,
    );
    for (const fileId of obsolete) {
      await this.fileStore.remove(fileId);
      await this.db.runTransaction(async (tx) => {
        const revision = this.db.doc('system/academicRevision');
        const [current, lock] = await Promise.all([
          tx.get(ref),
          tx.get(revision),
        ]);
        if (!current.exists || current.data().fileId === fileId) return;
        const next = current.data();
        next.obsoleteFileIds = (next.obsoleteFileIds || []).filter(
          (id) => id !== fileId,
        );
        next.fileCleanupPending = next.obsoleteFileIds.length > 0;
        tx.set(ref, next);
        tx.set(revision, {
          revision: (lock.data()?.revision || 0) + 1,
          updatedAt: new Date().toISOString(),
        });
      });
    }
  }
}
