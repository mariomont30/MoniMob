# Testes executados

Este documento reúne os resultados obtidos durante o desenvolvimento até **4 de novembro de 2026**. As suítes de código permanecem no repositório. Os resultados de dispositivo descrevem as configurações efetivamente exercitadas.

## Versão 1.0.3

- **127 testes de código aprovados**: 69 do aplicativo e 58 do backend.
- **27 verificações locais de Firebase aprovadas**: 8 de persistência, 15 de regras, 1 fluxo de Authentication/API e 3 de concorrência.
- **23 verificações Android concluídas** na nova interface, incluindo filtros avançados, recomendações, reserva persistida após reabrir, escalas de fonte, orientação, perfis e CSV.
- Abertura aprovada verificada no Expo Go em quatro configurações de tela e fonte; a mesma identidade está presente no APK, no ícone com degradê azul e na capa do README.
- Contraste dos textos secundários e dos botões verificado nas superfícies utilizadas.
- Integração real com o Gemini exercitada, com chave mantida no backend.

Os resultados de 3 de novembro abaixo são mantidos como histórico da versão anterior. As alterações da nova interface foram verificadas separadamente.

## Código e integração — histórico

| Grupo executado | Resultado |
|:--|:--|
| Base funcional: domínio, aplicativo e backend | 107 testes aprovados |
| Nova execução da versão pública | 110 testes aprovados: 58 do aplicativo e 52 do backend, incluindo 3 verificações da configuração pública |
| Regras, integração e concorrência com Firebase Emulator Suite | 22 verificações aprovadas, reexecutadas na versão pública |
| Validação do contexto e autorização do MoniBot | Respostas limitadas ao contexto permitido e rejeição de acessos indevidos |
| Recuperação de conta | Envio e uso do e-mail real de redefinição de senha |
| Fluxos acadêmicos | Exercitados com aluno, monitor e professor, incluindo permissões e vínculos |
| Concorrência e repetição de solicitações | 40 contas simultâneas e 5 instâncias da API; 142 requisições sem erro técnico no ambiente local |

Os testes cobrem reservas, cancelamentos, fila de espera, conflitos, presença, favoritos, publicações, materiais, relatórios, tratamento de erros e isolamento entre perfis. O aplicativo utiliza Authentication e Firestore; os dados sintéticos utilizados pelas suítes são restritos ao ambiente de testes.

## Android e interface

| Verificação executada | Resultado |
|:--|:--|
| Responsividade | 104 cenários registrados com variações de largura, orientação, escala de fonte e teclado |
| Aparelho Android com Expo Go | Abertura, reserva, persistência após reabrir, MoniBot e confirmação de presença exercitados |
| Presença repetida | Interface apresenta presença já registrada e desativa nova confirmação |
| Emulador Android | Navegação e fluxos dos perfis exercitados, incluindo formulários e teclado |
| CSV exportado | 6 verificações com recebimento no Android, abertura, leitura e conferência dos dados |
| Instalação e atualização do APK | APK assinado instalado e atualização exercitada com preservação da sessão |
| Acessibilidade | Amostra de navegação com TalkBack e escalas ampliadas de fonte |
| Exportação da versão pública | Pacotes JavaScript Android e iOS gerados com sucesso; a geração iOS não representa execução em aparelho Apple |

Os cenários de responsividade incluem telas compactas, orientação paisagem e tablet. A amostra de TalkBack representa as interações exercitadas, sem equivaler a uma certificação completa de acessibilidade.

## Lembretes automáticos

Foram executados **3 ciclos automáticos locais** usando Firestore real, com conferência da criação e persistência dos avisos e do controle de duplicidade. Os registros isolados criados especificamente para essa verificação foram removidos ao final.

O resultado corresponde ao processo local de lembretes. O computador e a rotina precisam permanecer ligados para essa modalidade de execução.

## Executar as suítes

```bash
npm ci --prefix mobile-expo
npm ci --prefix backend
npm test
```

As verificações que dependem de emuladores utilizam o comando separado `npm run test:emulators`, documentado no [guia de configuração](../CONFIGURACAO.md). As suítes comuns não precisam de senhas reais nem da chave Gemini.
