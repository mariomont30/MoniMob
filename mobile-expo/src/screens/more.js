import React from 'react';
import { Screen, MenuLink } from '../components/ui.js';

export function MoreScreen({ role, go, ...props }) {
  const items = role === 'student'
    ? [
        ['MoniBot', 'Tire dúvidas sobre monitorias', 'bot'],
        ['Materiais', 'Acesse conteúdos das disciplinas', 'materials'],
        ['Registrar presença', 'Informe o código recebido do monitor', 'attendance'],
        ['Notificações', 'Acompanhe atualizações da sua conta', 'notifications'],
        ['Meu perfil', 'Consulte seus dados e saia da conta', 'profile']
      ]
    : role === 'monitor'
      ? [
          ['MoniBot', 'Ajuda sobre o funcionamento do MoniMob', 'bot'],
          ['Materiais', 'Organize os conteúdos das disciplinas', 'manageMaterials'],
          ['Meu perfil', 'Consulte seus dados e saia da conta', 'profile']
        ]
      : [
          ['MoniBot', 'Ajuda sobre o funcionamento do MoniMob', 'bot'],
          ['Meu perfil', 'Consulte seus dados e saia da conta', 'profile']
        ];

  return (
    <Screen {...props} title="Mais" subtitle="Outras ferramentas do MoniMob">
      {items.map(([title, subtitle, route]) => (
        <MenuLink key={route} title={title} subtitle={subtitle} onPress={() => go(route)} />
      ))}
    </Screen>
  );
}
