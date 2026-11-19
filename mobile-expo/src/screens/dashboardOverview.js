import React from 'react';
import { Text } from 'react-native';
import { Screen, Card, Button, Badge } from '../components/ui.js';
import { styles } from '../theme/styles.js';
import { displayDate } from '../services/presentation.js';
import { dashboardItems } from '../services/dashboardData.js';
const titles={disciplines:'Minhas disciplinas',completed:'Sessões concluídas',pending:'Pendências',participants:'Alunos reservados',adjustments:'Monitorias com ajustes',reservations:'Minhas reservas confirmadas'};
export function DashboardOverview({state,user,role,kind,go,openSession,openParticipants,reloadData,...props}) {
  const items=dashboardItems(state,user.id,role,kind);
  const open=item=>item.route?go(item.route):item.session?openSession(item.session):openParticipants(item.participantSessionId);
  return <Screen {...props} role={role} title={titles[kind]||'Atividades'} subtitle={`${items.length} registro(s)`}>
    <Button label="Atualizar lista" variant="outline" onPress={reloadData} />
    {!items.length?<Card><Text style={styles.cardTitle}>Nenhum registro neste indicador</Text><Text style={styles.cardBody}>Não há itens para apresentar nesta categoria. Novas atividades aparecerão após a atualização.</Text></Card>:null}
    {items.map(item=><Card key={item.id} onPress={()=>open(item)}>
      <Text style={styles.cardTitle}>{item.label}</Text>
      {item.detail?<Text style={styles.cardBody}>{item.detail}</Text>:null}
      {item.session?<Text style={styles.meta}>{displayDate(item.session.date)} · {item.session.time}</Text>:null}
      {item.session?.authorizationInvalid?<Badge tone="warning">Fora do período autorizado</Badge>:null}
      <Button variant="outline" label={item.action||'Abrir detalhes'} onPress={()=>open(item)} />
    </Card>)}
  </Screen>;
}
