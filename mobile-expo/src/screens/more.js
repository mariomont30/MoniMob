import React from 'react';
import { Screen, MenuLink } from '../components/ui.js';

export function MoreScreen({ role, go, ...props }) {
  const items = role === 'student'
    ? [
        ['Meus favoritos', 'Consulte as monitorias salvas na sua conta', 'favorites'],
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
          ['Ajustes solicitados', 'Corrija e reenvie os itens devolvidos pelo professor', 'adjustments'],
          ['Vínculos acadêmicos', 'Solicite disciplinas e acompanhe a aprovação', 'academicLinks'],
          ['Notificações', 'Acompanhe decisões e atualizações', 'notifications'],
          ['Meu perfil', 'Consulte seus dados e saia da conta', 'profile']
        ]
      : [
          ['MoniBot', 'Ajuda sobre o funcionamento do MoniMob', 'bot'],
          ['Disciplinas e monitores', 'Analise solicitações e supervisione vínculos', 'academicLinks'],
          ['Materiais', 'Publique arquivos e supervisione conteúdos', 'manageMaterials'],
          ['Notificações', 'Acompanhe decisões e atualizações', 'notifications'],
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
