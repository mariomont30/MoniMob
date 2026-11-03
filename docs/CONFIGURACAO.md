# Configuração do MoniMob

O código utiliza Firebase Authentication, Cloud Firestore e uma API Node.js. A distribuição pública não inclui contas prontas, credenciais administrativas ou registros de demonstração. Cada instalação do código precisa da configuração do seu próprio ambiente.

## Firebase e aplicativo

1. Crie ou selecione um projeto Firebase sob sua administração.
2. Habilite o provedor **E-mail/senha** no Authentication e configure um banco Cloud Firestore.
3. Registre um aplicativo Web no mesmo projeto para obter os parâmetros usados pelo SDK JavaScript do aplicativo.
4. Copie `mobile-expo/.env.example` para `mobile-expo/.env`. Preencha os valores `EXPO_PUBLIC_FIREBASE_*` a partir da configuração do aplicativo Web.
5. Defina `EXPO_PUBLIC_MONIMOB_API_URL` com o endereço HTTPS acessível da API. Reinicie o Expo após alterar as variáveis.

Os parâmetros `EXPO_PUBLIC_*` são incorporados ao aplicativo e podem ser lidos por quem o instala. Eles não podem receber senhas, chaves privadas da IA ou credenciais administrativas. A configuração pública do Firebase identifica o projeto; a autorização depende do Authentication, das regras e das verificações do backend.

O aplicativo exige `API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID` e `APP_ID`. Os demais campos públicos são opcionais e devem corresponder ao mesmo projeto.

## Backend

Instale as dependências com `npm ci --prefix backend`. Copie `backend/.env.example` para `backend/.env` e configure:

| Variável | Uso |
|:--|:--|
| `GCLOUD_PROJECT` | Identificador do projeto Firebase |
| `GOOGLE_APPLICATION_CREDENTIALS` | Caminho absoluto de uma credencial local autorizada, mantida fora do repositório |
| `GEMINI_API_KEY` | Chave privada da IA, exclusiva do servidor |
| `GEMINI_MODEL` | Modelo disponível para a chave configurada |
| `PORT` | Porta local da API, inicialmente 8787 |
| `ALLOWED_ORIGINS` | Origens Web autorizadas, separadas por vírgula |

O Firebase Admin SDK também aceita as credenciais padrão do ambiente. Em infraestrutura gerenciada, utilize a identidade do serviço com as permissões necessárias. Não coloque um JSON administrativo dentro do código do aplicativo.

Execute `npm run start:backend` na raiz do projeto. Para testar no aparelho, disponibilize a API por HTTPS e use esse endereço no ambiente do aplicativo. O túnel temporário precisa permanecer ativo enquanto estiver sendo usado.

O arquivo `firestore.rules` contém as regras do projeto. Publique-as no **projeto correto** com uma sessão administrativa autorizada:

```bash
npx firebase-tools deploy --only firestore:rules --project SEU_PROJETO
```

Essa operação altera as regras do projeto indicado. A configuração local dos arquivos não publica serviços nem habilita cobrança.

## Perfis e vínculos acadêmicos

O cadastro público cria uma conta de aluno. Monitores e professores recebem seus papéis por administração autorizada, vinculados a contas existentes do Firebase Authentication. As disciplinas e os vínculos precisam representar os cadastros da instituição.

O comando administrativo valida um arquivo local com as coleções `profiles`, `disciplines`, `monitorDisciplines` e `professorDisciplines`:

```bash
node backend/scripts/admin.mjs --file CAMINHO_DO_ARQUIVO_LOCAL.json --project SEU_PROJETO
```

Sem `--apply`, o comando apenas valida a estrutura do arquivo. Com `--apply`, verifica as contas, grava os registros e sincroniza os papéis no Authentication. Guarde os arquivos com dados pessoais fora do repositório.

## Lembretes

Com o ambiente do backend configurado, execute:

```bash
npm --prefix backend run reminders:local
```

O processo verifica os lembretes a cada hora; o primeiro ciclo ocorre após uma hora. O computador e o processo precisam continuar ligados. Os lembretes são avisos dentro do aplicativo e possuem controle de duplicidade.

O código também inclui a função agendada do Firebase em `backend/src/functions.js`. Sua execução na nuvem depende de publicação e de uma infraestrutura compatível configurada pelo administrador; ela não é ativada ao baixar o APK.

## Desenvolvimento isolado

As suítes em `tests/firestore/` usam o projeto reservado `demo-monimob` nos emuladores locais de Authentication e Firestore. Esse nome identifica somente o ambiente de testes. As massas de teste ficam nas suítes e não são importadas pelo aplicativo em execução normal.

Para executar essas verificações, instale Java compatível com o Firebase Emulator Suite e as dependências locais:

```bash
npm install --prefix tests/firestore
npm run test:emulators
```

Não configure variáveis de emulador numa compilação de distribuição.
