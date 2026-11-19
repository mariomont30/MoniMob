# Documentação do MoniMob

Use este índice para conhecer a estrutura do projeto, executar uma cópia local
ou localizar as regras dos fluxos acadêmicos.

| Para | Consulte |
| --- | --- |
| Conhecer o projeto e os três perfis | [Apresentação do MoniMob](../README.md) |
| Executar o Expo Go com seu próprio ambiente | [Configuração local](CONFIGURACAO.md) |
| Instalar ou gerar o APK | [Guia Android](instalacao/ANDROID.md) |
| Entender autorização, revisão de materiais e MoniBot | [Arquitetura](ARQUITETURA.md) |
| Consultar a modelagem | [Diagrama de casos de uso](diagrams/use-cases.svg) e [fonte PlantUML](diagrams/use-cases.puml) |
| Ver as mudanças por versão | [Histórico de versões](../CHANGELOG.md) |

## Onde encontrar cada parte

| Área | Caminho | Responsabilidade |
| --- | --- | --- |
| Interface | [`mobile-expo/src/screens/`](../mobile-expo/src/screens/) | Telas de Aluno, Monitor, Professor e MoniBot. |
| Domínio do aplicativo | [`mobile-expo/src/domain/`](../mobile-expo/src/domain/) | Regras acadêmicas compartilhadas com a API. |
| Servidor | [`backend/src/`](../backend/src/) | Rotas, autorização, persistência e serviços do MoniBot. |
| Verificação | [`mobile-expo/tests/`](../mobile-expo/tests/), [`backend/tests/`](../backend/tests/) e [`tests/firestore/`](../tests/firestore/) | Testes de interface e domínio, integração e regras do banco. |
| Desenvolvimento | [`scripts/dev/`](../scripts/dev/) | Instalação, inicialização local e diagnóstico. |
| Firebase | [`scripts/firebase/`](../scripts/firebase/) e [`firestore.rules`](../firestore.rules) | Publicação das regras e configuração da conexão. |
| Manutenção | [`scripts/maintenance/`](../scripts/maintenance/) | Sincronização do domínio e geração do som de abertura. |
| Automação de testes | [`scripts/quality/`](../scripts/quality/) e [`.github/workflows/`](../.github/workflows/) | Verificação da fonte, emuladores e integração contínua. |

## Recursos para distribuição

- [Identidade visual](assets/brand/) reúne as versões da capa.
- [Apresentação Android](assets/android/) contém o QR Code e a tela inicial.
- [Casos de uso](diagrams/) contém a fonte PlantUML e as imagens exportadas.
- [Checksums por versão](releases/) ajudam a conferir a integridade do APK.

[Voltar ao README](../README.md) ·
[Contribuir](../CONTRIBUTING.md) · [Segurança](../SECURITY.md)
