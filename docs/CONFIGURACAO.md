# Configuração local

O repositório público contém o código e exemplos de configuração. As chaves
privadas devem permanecer somente no computador ou no ambiente do servidor.

## Pré-requisitos

- Node.js 22 e npm.
- VS Code e Expo Go compatível com o SDK do projeto.
- Um projeto Firebase próprio, com Authentication por e-mail/senha e Firestore.
- Uma chave Gemini válida no backend para usar o MoniBot.

## Preparar a aplicação

Na raiz do projeto, copie os exemplos:

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item mobile-expo/.env.example mobile-expo/.env
```

Preencha os identificadores do aplicativo Web no arquivo do mobile. No backend,
configure o mesmo projeto Firebase, a chave Gemini e o caminho de um JSON
autorizado do Firebase Admin SDK. Guarde esse JSON em
`backend/credentials/firebase-admin.json`, fora do Git. Não coloque chaves do
Gemini ou do Admin SDK em variáveis `EXPO_PUBLIC_`.

O identificador do projeto no cliente, no servidor e na credencial
administrativa deve ser o mesmo. O identificador de Analytics é opcional.

Instale as dependências e publique as regras **no seu próprio projeto**:

```powershell
npm.cmd run instalar
npm.cmd run firebase:regras
npm.cmd run iniciar
```

O inicializador também prepara dependências ausentes. Use somente uma execução
por vez e mantenha o terminal aberto. No celular, leia o QR Code no Expo Go.
Para conexão local, use a mesma rede do computador e permita o acesso ao
servidor no firewall quando o Windows solicitar.

A URL do backend é descoberta e propagada pelo inicializador. Não é necessário
digitar um endereço de servidor no aplicativo. No Windows x64, o utilitário de
túnel ausente é baixado da distribuição oficial com verificação SHA-256. Outros
ambientes podem fornecer o caminho em `MONIMOB_CLOUDFLARED`; esses ambientes
precisam de validação própria.

## Cadastro e fluxo acadêmico

O usuário escolhe Aluno, Monitor ou Professor e confirma o endereço por e-mail.
A confirmação de e-mail ativa o perfil escolhido. Este cadastro não realiza
verificação administrativa da identidade institucional.

A aprovação acadêmica ocorre nos vínculos e nos materiais do Monitor. O
Professor vincula suas disciplinas, recebe solicitações e aprova ou solicita
ajustes. Somente conteúdos liberados ficam disponíveis ao Aluno.

O catálogo de disciplinas é informação de referência; usuários, reservas e
monitorias devem ser criados pelos participantes, sem contas de demonstração.

## Diagnóstico

Execute `npm.cmd run diagnostico` antes de iniciar se houver falhas de
configuração. Se a instalação parar por falta de espaço, conclua a instalação
antes de abrir o aplicativo. O backend precisa continuar ativo para atender às
operações que dependem dele.

O APK publicado está associado ao Firebase da distribuição acadêmica. Usar um
Firebase diferente exige gerar outro APK com a configuração correspondente.
Consulte [Android](instalacao/ANDROID.md) e [arquitetura](ARQUITETURA.md).
