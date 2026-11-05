import React, { useState } from 'react';
import { Alert, Text } from 'react-native';
import { Screen, Card, Field, Button, SectionTitle, Choice } from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { ROLE_LABELS } from '../constants.js';
import { userErrorMessage } from '../services/userErrors.js';

export function Profile({ auth, user, setUser, activeRole, chooseRole, signOut, ...props }) {
  const [name, setName] = useState(user.name);
  const save = async () => { try { const updated = await auth.updateProfile(user.id, { name }); setUser(updated); Alert.alert('Perfil', 'Nome salvo no seu perfil.'); } catch (error) { Alert.alert('Perfil', userErrorMessage(error)); } };
  return <Screen {...props} title="Perfil" subtitle="Dados da sua conta"><Card accent><Text style={styles.heroTitle}>{user.name}</Text><Text style={styles.cardBody}>{user.registration} · {user.email}</Text><Text style={styles.meta}>Área ativa: {ROLE_LABELS[activeRole]}</Text></Card><Field label="Nome de exibição" value={name} onChangeText={setName} /><Button label="Salvar perfil" onPress={save} />{user.roles.length > 1 ? <><SectionTitle>Alternar área</SectionTitle>{user.roles.map(role => <Choice key={role} label={ROLE_LABELS[role]} selected={role === activeRole} onPress={() => chooseRole(role)} />)}</> : null}<Card><Text style={styles.cardTitle}>Como o perfil é definido?</Text><Text style={styles.cardBody}>O papel pertence à conta acadêmica e nunca é escolhido no cadastro. As permissões são administradas pela instituição.</Text></Card><Button label="Sair" variant="outline" onPress={signOut} /></Screen>;
}
