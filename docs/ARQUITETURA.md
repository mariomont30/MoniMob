# Arquitetura e decisões

O MoniMob organiza o fluxo acadêmico entre Professor, Monitor e Aluno. O mobile
apresenta as áreas de cada perfil, enquanto o backend verifica autenticação,
permissões e regras das operações.

## Componentes

| Camada             | Local                        | Responsabilidade                        |
| ------------------ | ---------------------------- | --------------------------------------- |
| Aplicação          | `mobile-expo/`               | Interface, navegação e comunicação      |
| Servidor           | `backend/src/`               | API, autorização e operações acadêmicas |
| Segurança de dados | `firestore.rules`            | Regras de acesso ao Firestore           |
| Verificação        | `tests/` e testes do backend | Regressões e integrações                |
| Operação local     | `scripts/`                   | Instalação, diagnóstico e inicialização |
| Modelagem          | `docs/diagrams/`             | Casos de uso em PlantUML                |

As implementações de regras compartilhadas devem permanecer coerentes entre
cliente e servidor. Transações e verificações no servidor protegem operações
concorrentes; esconder um botão na interface não substitui autorização.

## Relação entre os perfis

1. O Professor vincula as disciplinas que supervisiona.
2. O Monitor solicita vínculo; o Professor analisa a solicitação.
3. O Monitor agenda sessões dentro dos limites autorizados.
4. Materiais do Professor são disponibilizados aos participantes autorizados.
5. Materiais do Monitor passam por revisão do Professor antes da publicação.
6. Ajustes retornam ao Monitor para correção e novo envio.
7. O Aluno consulta materiais liberados, usa favoritos e reserva monitorias.

Os relatórios refletem as operações e os vínculos correspondentes. A autorização
acadêmica não deve ser confundida com a escolha do perfil no cadastro.

## Arquivos e revisão

Os anexos utilizam documentos segmentados no Firestore, com limite de 5 MB por
arquivo na aplicação. Essa escolha evita exigir Cloud Storage nesta entrega, mas
continua consumindo a cota do Firestore. Não equivale a armazenamento ilimitado.
As versões e os estados de revisão controlam a publicação do material.

## MoniBot

O mobile apresenta o estado de resposta e envia a pergunta ao backend. O
servidor constrói um contexto limitado ao escopo autorizado do usuário e
consulta o Gemini. A chave fica no servidor. Metadados de materiais não
significam leitura integral de PDFs, imagens ou documentos pelo modelo.

O assistente não substitui as rotas que efetivam reservas, aprovações ou
exclusões. Respostas e latência dependem de rede, disponibilidade e cota do
provedor. Não há garantia de tempo fixo ou de respostas sempre corretas.

## Verificação reproduzível

As verificações unitárias podem ser executadas com:

```powershell
npm.cmd test
node scripts/check-public.mjs
```

As integrações devem usar emuladores, sem credenciais reais:

```powershell
npm.cmd ci --prefix tests/firestore
$env:GCLOUD_PROJECT = "demo-monimob"
.\tests\firestore\node_modules\.bin\firebase.cmd emulators:exec --project demo-monimob --only firestore,auth "node scripts/run-emulator-tests.mjs"
```

É necessário Java compatível com o Firebase CLI para os emuladores. No CI são
usados Node.js 22 e Java 21. Os testes cobrem regras, autenticação e fluxos
acadêmicos; não substituem avaliação visual em aparelhos reais.

## Limites desta distribuição

- O backend e os serviços locais precisam permanecer ativos.
- O cadastro confirma o e-mail, mas não verifica vínculo institucional externo.
- Anexos e IA estão sujeitos às cotas dos serviços utilizados.
- Funcionalidades de lembretes dependem do processo responsável em execução.
- A disponibilidade de código para iOS não representa certificação em iPhone.

Consulte os [casos de uso](diagrams/use-cases.puml) e
[a configuração](CONFIGURACAO.md).
