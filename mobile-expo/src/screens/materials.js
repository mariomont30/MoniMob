import { entityRevision, latestReview } from '../domain/review.js';
import { MaterialLibrary } from './materialLibrary.js';
import React, { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import {
  Screen,
  Card,
  Button,
  SectionTitle,
  Choice,
  Field,
  Badge,
} from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { statusLabel } from '../constants.js';
import { activeAcademicLink } from '../domain/workflow.js';
import { pickMaterialFile } from '../services/materialFileApi.js';
import { userErrorMessage } from '../services/userErrors.js';
export function ManageMaterials(props) {
  return <MaterialLibrary {...props} />;
}
export function CreateMaterial({
  state,
  user,
  role,
  selectedMaterial,
  save,
  goLinks,
  ...props
}) {
  const links = (
    role === 'professor' ? state.professorDisciplines : state.monitorDisciplines
  ).filter(
    (x) =>
      (role === 'professor' ? x.professorId : x.monitorId) === user.id &&
      activeAcademicLink(x),
  );
  const [editing] = useState(() =>
    selectedMaterial &&
    (selectedMaterial.ownerId ||
      selectedMaterial.monitorId ||
      selectedMaterial.professorId) === user.id
      ? selectedMaterial
      : null,
  );
  const feedback = editing ? latestReview(state, 'material', editing.id) : null;
  const [disciplineId, setDiscipline] = useState(
    editing?.disciplineId || links[0]?.disciplineId || '',
  );
  const [title, setTitle] = useState(editing?.title || '');
  const [url, setUrl] = useState(editing?.url || '');
  const [mode, setMode] = useState(
    editing && !editing.fileId ? 'link' : 'file',
  );
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const run = async (task) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError(userErrorMessage(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const submit = () =>
    run(async () => {
      if (!title.trim() || title.trim().length > 200)
        throw new Error('Informe um título de até 200 caracteres.');
      if (!disciplineId) throw new Error('Selecione uma disciplina vinculada.');
      if (mode === 'file' && !file && !editing?.fileId)
        throw new Error('Selecione um arquivo antes de enviar.');
      if (mode === 'link') {
        let valid = false;
        try {
          const u = new URL(url.trim());
          valid = u.protocol === 'https:' && !u.username && !u.password;
        } catch {}
        if (!valid) throw new Error('Informe um link HTTPS válido.');
      }
      await save(
        {
          id: editing?.id,
          expectedRevision: editing ? entityRevision(editing) : undefined,
          keepExistingFile: Boolean(
            editing?.fileId && mode === 'file' && !file,
          ),
          disciplineId,
          title: title.trim(),
          type: 'Link',
          url: url.trim(),
        },
        mode === 'file' ? file : null,
      );
    });
  return (
    <Screen
      {...props}
      onBack={busy ? undefined : props.onBack}
      role={role}
      title={editing ? 'Editar material' : 'Cadastrar material'}
      subtitle={
        role === 'professor'
          ? 'Publicação para alunos e monitores vinculados'
          : 'O professor aprova antes de liberar aos alunos'
      }
    >
      {!links.length ? (
        <Card>
          <Text style={styles.cardBody}>
            Você precisa de uma disciplina vinculada para publicar materiais.
          </Text>
          <Button label="Gerenciar vínculos" onPress={goLinks} />
        </Card>
      ) : null}
      {editing?.status === 'adjustments_requested' ? (
        <Card>
          <Text style={styles.cardTitle}>
            Ajustes solicitados pelo professor
          </Text>
          <Text style={styles.cardBody}>
            {feedback?.comment ||
              'Confira a orientação em Ajustes solicitados.'}
          </Text>
          <Text style={styles.meta}>
            Corrija o conteúdo e reenvie. Os alunos terão acesso após a nova
            aprovação.
          </Text>
        </Card>
      ) : null}
      <SectionTitle>Disciplina</SectionTitle>
      {links
        .filter((x) => !editing || x.disciplineId === editing.disciplineId)
        .map((x) => (
          <Choice
            key={x.id}
            label={
              state.disciplines.find((d) => d.id === x.disciplineId)?.name ||
              x.disciplineId
            }
            selected={disciplineId === x.disciplineId}
            onPress={() => !busy && setDiscipline(x.disciplineId)}
          />
        ))}
      <Field
        label="Título do material"
        value={title}
        onChangeText={setTitle}
        editable={!busy}
      />
      <Choice
        label="Arquivo do aparelho"
        selected={mode === 'file'}
        onPress={() => !busy && setMode('file')}
      />
      {!editing?.fileId ? (
        <Choice
          label="Link HTTPS"
          selected={mode === 'link'}
          onPress={() => !busy && setMode('link')}
        />
      ) : null}
      {mode === 'file' ? (
        <Card>
          <Text style={styles.cardBody}>
            PDF, PNG, JPG, TXT, DOCX, PPTX ou XLSX. Limite: 5 MB por arquivo.
          </Text>
          {editing?.fileId && !file ? (
            <Text style={styles.cardBody}>
              Arquivo atual: {editing.fileName}. Você pode manter este arquivo
              ao corrigir os dados ou selecionar uma versão corrigida abaixo.
            </Text>
          ) : null}
          {file ? (
            <Text style={styles.meta}>
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </Text>
          ) : null}
          <Button
            label={
              file || editing?.fileId ? 'Trocar arquivo' : 'Selecionar arquivo'
            }
            variant="outline"
            disabled={busy}
            onPress={() =>
              run(async () => {
                const picked = await pickMaterialFile();
                if (picked) setFile(picked);
              })
            }
          />
        </Card>
      ) : (
        <Field
          label="URL do material"
          value={url}
          onChangeText={setUrl}
          editable={!busy}
        />
      )}
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[
            styles.meta,
            {
              color: '#B42318',
            },
          ]}
        >
          {error}
        </Text>
      ) : null}
      <Button
        label={
          busy
            ? 'Enviando…'
            : role === 'professor'
              ? 'Publicar material'
              : editing
                ? 'Reenviar para aprovação'
                : 'Enviar para aprovação'
        }
        disabled={busy || !links.length}
        onPress={submit}
      />
    </Screen>
  );
}
