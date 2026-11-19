import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Screen, Card, Field, Button, SectionTitle, Choice } from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { OpeningSoundSetting } from '../components/launchExperience.js';
import { ROLE_LABELS } from '../constants.js';
import { userErrorMessage } from '../services/userErrors.js';

export function Profile({
  auth,
  user,
  setUser,
  activeRole,
  chooseRole,
  signOut,
  onDeleteAccount,
  ...props
}) {
  const [name, setName] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const lock = React.useRef(false);
  const save = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const updated = await auth.updateProfile(user.id, { name });
      setUser(updated);
      Alert.alert('Perfil', 'Nome salvo no seu perfil.');
    } catch (error) {
      Alert.alert('Perfil', userErrorMessage(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen {...props} title="Perfil" subtitle="Dados da sua conta">
      <Card accent>
        <Text style={styles.heroTitle}>{user.name}</Text>
        <Text style={styles.cardBody}>
          {user.registration} · {user.email}
        </Text>
        <Text style={styles.meta}>Área ativa: {ROLE_LABELS[activeRole]}</Text>
      </Card>
      <Field label="Nome de exibição" value={name} onChangeText={setName} editable={!busy} />
      <Button label="Salvar perfil" disabled={busy} onPress={save} />
      {user.roles.length > 1 ? (
        <>
          <SectionTitle>Alternar área</SectionTitle>
          {user.roles.map((role) => (
            <Choice
              key={role}
              label={ROLE_LABELS[role]}
              selected={role === activeRole}
              onPress={() => {
                if (!busy) chooseRole(role);
              }}
            />
          ))}
        </>
      ) : null}
      <Card>
        <Text style={styles.cardTitle}>Como o perfil é definido?</Text>
        <Text style={styles.cardBody}>
          O perfil escolhido no cadastro é ativado após a confirmação do e-mail. Os vínculos com
          disciplinas são gerenciados em Vínculos acadêmicos: o monitor solicita e o professor analisa.
        </Text>
      </Card>
      <Card>
        <OpeningSoundSetting />
      </Card>
      <Button label="Sair" variant="primary" disabled={busy} onPress={signOut} />
      <SectionTitle>Gerenciar conta</SectionTitle>
      <Button
        label="Excluir minha conta"
        variant="delete"
        disabled={busy}
        onPress={onDeleteAccount}
      />
    </Screen>
  );
}
