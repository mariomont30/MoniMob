'use strict';
// Maintenance bridge: runs in the user's regular terminal, outside Codex.
// It prepares an isolated public checkout, never uploads the private archive,
// and opens a PR. Main and the verified release require successful CI.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const files = {
  "docs/CONFIGURACAO.md": "# Configuração local\n\nO repositório público contém o código e exemplos de configuração. As chaves\nprivadas devem permanecer somente no computador ou no ambiente do servidor.\n\n## Pré-requisitos\n\n- Node.js 22 e npm.\n- VS Code e Expo Go compatível com o SDK do projeto.\n- Um projeto Firebase próprio, com Authentication por e-mail/senha e Firestore.\n- Uma chave Gemini válida no backend para usar o MoniBot.\n\n## Preparar a aplicação\n\nNa raiz do projeto, copie os exemplos:\n\n```powershell\nCopy-Item backend/.env.example backend/.env\nCopy-Item mobile-expo/.env.example mobile-expo/.env\n```\n\nPreencha os identificadores do aplicativo Web no arquivo do mobile. No backend,\nconfigure o mesmo projeto Firebase, a chave Gemini e o caminho de um JSON\nautorizado do Firebase Admin SDK. Guarde esse JSON em\n`backend/credentials/firebase-admin.json`, fora do Git. Não coloque chaves do\nGemini ou do Admin SDK em variáveis `EXPO_PUBLIC_`.\n\nO identificador do projeto no cliente, no servidor e na credencial administrativa\ndeve ser o mesmo. O identificador de Analytics é opcional.\n\nInstale as dependências e publique as regras **no seu próprio projeto**:\n\n```powershell\nnpm.cmd run instalar\nnpm.cmd run firebase:regras\nnpm.cmd run iniciar\n```\n\nO inicializador também prepara dependências ausentes. Use somente uma execução\npor vez e mantenha o terminal aberto. No celular, leia o QR Code no Expo Go.\nPara conexão local, use a mesma rede do computador e permita o acesso ao servidor\nno firewall quando o Windows solicitar.\n\nA URL do backend é descoberta e propagada pelo inicializador. Não é necessário\ndigitar um endereço de servidor no aplicativo. No Windows x64, o utilitário de\ntúnel ausente é baixado da distribuição oficial com verificação SHA-256. Outros\nambientes podem fornecer o caminho em `MONIMOB_CLOUDFLARED`; esses ambientes\nprecisam de validação própria.\n\n## Cadastro e fluxo acadêmico\n\nO usuário escolhe Aluno, Monitor ou Professor e confirma o endereço por e-mail.\nA confirmação de e-mail ativa o perfil escolhido. Este cadastro não realiza\nverificação administrativa da identidade institucional.\n\nA aprovação acadêmica ocorre nos vínculos e nos materiais do Monitor. O Professor\nvincula suas disciplinas, recebe solicitações e aprova ou solicita ajustes.\nSomente conteúdos liberados ficam disponíveis ao Aluno.\n\nO catálogo de disciplinas é informação de referência; usuários, reservas e\nmonitorias devem ser criados pelos participantes, sem contas de demonstração.\n\n## Diagnóstico\n\nExecute `npm.cmd run diagnostico` antes de iniciar se houver falhas de\nconfiguração. Se a instalação parar por falta de espaço, conclua a instalação\nantes de abrir o aplicativo. O backend precisa continuar ativo para atender às\noperações que dependem dele.\n\nO APK publicado está associado ao Firebase da distribuição acadêmica. Usar um\nFirebase diferente exige gerar outro APK com a configuração correspondente.\nConsulte [Android](instalacao/ANDROID.md) e\n[arquitetura](ARQUITETURA.md).\n",
  "docs/instalacao/ANDROID.md": "# Android e APK\n\n## Download\n\nBaixe o [APK da versão 1.7.4](https://github.com/mariomont30/MoniMob/releases/tag/v1.7.4).\nO arquivo `MoniMob-Android.apk` requer Android 7 ou superior. A versão nativa\ndo pacote acadêmico é `1.7.4-private`, código 22.\n\nO arquivo SHA-256 acompanha a release. Compare o resultado antes de instalar:\n\n```powershell\nGet-FileHash .\\MoniMob-Android.apk -Algorithm SHA256\n```\n\nAutorize a instalação a partir da fonte utilizada quando o Android solicitar.\nOs identificadores públicos do Firebase fazem parte da configuração do cliente;\nas chaves administrativas e do Gemini pertencem ao servidor.\n\n## Backend durante o uso\n\nO APK contém o aplicativo, mas as operações de servidor precisam do backend\nativo. Esta distribuição acadêmica não inclui um serviço público permanente.\nExecute `npm.cmd run iniciar` na raiz do projeto configurado e mantenha o\ncomputador conectado. A descoberta de conexão é automática.\n\nUma release não significa disponibilidade contínua do backend. Para operação\nindependente do computador, ainda é necessário hospedar o servidor e configurar\num endereço estável.\n\n## Gerar outro APK\n\nUse as dependências fixadas no projeto, JDK 17 e Android SDK compatível. A\ncompilação nativa é diferente da execução pelo Expo Go e requer o ambiente\nAndroid instalado.\n\nConfigure a assinatura fora do Git. As variáveis exigidas estão no bloco\n`signingConfigs` de\n[`mobile-expo/android/app/build.gradle`](../../mobile-expo/android/app/build.gradle).\nSiga também o script de compilação disponível no projeto. Nunca versione o\narquivo da chave ou suas senhas.\n\nPara usar um projeto Firebase próprio, configure o cliente e o backend para esse\nmesmo projeto antes de gerar o APK. A configuração de exemplo não concede acesso\nao Firebase da distribuição acadêmica.\n",
  "docs/ARQUITETURA.md": "# Arquitetura e decisões\n\nO MoniMob organiza o fluxo acadêmico entre Professor, Monitor e Aluno. O mobile\napresenta as áreas de cada perfil, enquanto o backend verifica autenticação,\npermissões e regras das operações.\n\n## Componentes\n\n| Camada | Local | Responsabilidade |\n| --- | --- | --- |\n| Aplicação | `mobile-expo/` | Interface, navegação e comunicação |\n| Servidor | `backend/src/` | API, autorização e operações acadêmicas |\n| Segurança de dados | `firestore.rules` | Regras de acesso ao Firestore |\n| Verificação | `tests/` e testes do backend | Regressões e integrações |\n| Operação local | `scripts/` | Instalação, diagnóstico e inicialização |\n| Modelagem | `docs/diagrams/` | Casos de uso em PlantUML |\n\nAs implementações de regras compartilhadas devem permanecer coerentes entre\ncliente e servidor. Transações e verificações no servidor protegem operações\nconcorrentes; esconder um botão na interface não substitui autorização.\n\n## Relação entre os perfis\n\n1. O Professor vincula as disciplinas que supervisiona.\n2. O Monitor solicita vínculo; o Professor analisa a solicitação.\n3. O Monitor agenda sessões dentro dos limites autorizados.\n4. Materiais do Professor são disponibilizados aos participantes autorizados.\n5. Materiais do Monitor passam por revisão do Professor antes da publicação.\n6. Ajustes retornam ao Monitor para correção e novo envio.\n7. O Aluno consulta materiais liberados, usa favoritos e reserva monitorias.\n\nOs relatórios refletem as operações e os vínculos correspondentes. A autorização\nacadêmica não deve ser confundida com a escolha do perfil no cadastro.\n\n## Arquivos e revisão\n\nOs anexos utilizam documentos segmentados no Firestore, com limite de 5 MB por\narquivo na aplicação. Essa escolha evita exigir Cloud Storage nesta entrega,\nmas continua consumindo a cota do Firestore. Não equivale a armazenamento\nilimitado. As versões e os estados de revisão controlam a publicação do material.\n\n## MoniBot\n\nO mobile apresenta o estado de resposta e envia a pergunta ao backend. O servidor\nconstrói um contexto limitado ao escopo autorizado do usuário e consulta o Gemini.\nA chave fica no servidor. Metadados de materiais não significam leitura integral\nde PDFs, imagens ou documentos pelo modelo.\n\nO assistente não substitui as rotas que efetivam reservas, aprovações ou exclusões.\nRespostas e latência dependem de rede, disponibilidade e cota do provedor. Não há\ngarantia de tempo fixo ou de respostas sempre corretas.\n\n## Verificação reproduzível\n\nAs verificações unitárias podem ser executadas com:\n\n```powershell\nnpm.cmd test\nnode scripts/check-public.mjs\n```\n\nAs integrações devem usar emuladores, sem credenciais reais:\n\n```powershell\nnpm.cmd ci --prefix tests/firestore\n$env:GCLOUD_PROJECT = \"demo-monimob\"\n.\\tests\\firestore\\node_modules\\.bin\\firebase.cmd emulators:exec --project demo-monimob --only firestore,auth \"node scripts/run-emulator-tests.mjs\"\n```\n\nÉ necessário Java compatível com o Firebase CLI para os emuladores. No CI são\nusados Node.js 22 e Java 21. Os testes cobrem regras, autenticação e fluxos\nacadêmicos; não substituem avaliação visual em aparelhos reais.\n\n## Limites desta distribuição\n\n- O backend e os serviços locais precisam permanecer ativos.\n- O cadastro confirma o e-mail, mas não verifica vínculo institucional externo.\n- Anexos e IA estão sujeitos às cotas dos serviços utilizados.\n- Funcionalidades de lembretes dependem do processo responsável em execução.\n- A disponibilidade de código para iOS não representa certificação em iPhone.\n\nConsulte os [casos de uso](diagrams/use-cases.puml) e\n[a configuração](CONFIGURACAO.md).\n",
  "CONTRIBUTING.md": "# Como contribuir\n\nAbra uma issue descrevendo o problema, o comportamento esperado e os passos\npara reproduzir. Não inclua senhas, tokens, dados pessoais ou configurações\nprivadas nos anexos.\n\nPara contribuir com código:\n\n1. Crie uma branch com uma alteração de escopo claro.\n2. Configure seu próprio ambiente conforme [o guia](docs/CONFIGURACAO.md).\n3. Preserve a coerência das regras entre mobile e backend.\n4. Execute os testes aplicáveis e o verificador de arquivos públicos.\n5. Atualize a documentação quando o comportamento mudar.\n6. Abra um pull request explicando a mudança e a validação realizada.\n\nUse dados de teste nos emuladores. Não envie bancos reais, arquivos `.env`,\ncredenciais administrativas, chaves de assinatura, `node_modules` ou caches.\nArtefatos Android devem ser distribuídos pelas releases, após verificação.\n",
  "SECURITY.md": "# Segurança\n\nNão publique vulnerabilidades com dados sensíveis em issues abertas.\nUse o [relato privado do GitHub](https://github.com/mariomont30/MoniMob/security/advisories/new)\nquando disponível. Não envie chaves ou informações pessoais na descrição.\n\n## Informações privadas\n\nChaves do Gemini, credenciais do Firebase Admin SDK, tokens do GitHub e arquivos\nde assinatura devem permanecer fora do repositório. O projeto fornece exemplos\nsem valores privados e um verificador de arquivos públicos.\n\nOs identificadores do cliente Firebase presentes em um APK não são credenciais\nadministrativas. A proteção dos dados também depende das regras do Firestore e\ndas verificações de autorização do backend.\n\nO verificador reduz o risco de exposição, mas não detecta todos os formatos\npossíveis de segredo. Revise o conteúdo antes de publicar. Se uma chave privada\nfor exposta, revogue-a ou substitua-a: apagar um arquivo não remove o segredo do\nhistórico nem invalida a credencial.\n",
  "CHANGELOG.md": "# Histórico de versões\n\n## 1.7.4\n\nDistribuição acadêmica atualizada e preparação do repositório público.\n\n- Fluxos de Professor, Monitor e Aluno, com vínculos acadêmicos.\n- Cadastro, revisão, solicitação de ajustes e publicação de materiais.\n- Consulta de materiais e favoritos na área do Aluno.\n- Monitorias, reservas, presença e relatórios conforme o perfil.\n- MoniBot com indicação visual de resposta em andamento.\n- Exclusão de conta e retorno à abertura, conforme as preferências.\n- Documentação em português e inglês, configuração por exemplos e casos de uso.\n- Capa, QR Code, download do APK e arquivo de verificação SHA-256.\n- Verificação de conteúdo público e execução de testes no GitHub Actions.\n- Preparação do utilitário de túnel com verificação de integridade.\n\nO APK acadêmico identifica a versão nativa como `1.7.4-private`, código 22.\nO código público não inclui os segredos da distribuição privada.\n",
  ".github/PULL_REQUEST_TEMPLATE.md": "# Mudança\n\nDescreva o problema e o comportamento resultante.\n\n## Validação\n\nInforme os testes realizados e os limites da verificação.\n\n## Revisão\n\n- [ ] Não incluí credenciais, dados pessoais, caches ou dependências geradas.\n- [ ] Mantive as regras compartilhadas e a autorização coerentes.\n- [ ] Atualizei a documentação relevante.\n",
  ".github/ISSUE_TEMPLATE/bug.yml": "name: Relatar problema\ndescription: Informe um comportamento incorreto do MoniMob\ntitle: \"[Bug]: \"\nbody:\n  - type: markdown\n    attributes:\n      value: \"Não inclua senhas, tokens, dados pessoais ou arquivos privados.\"\n  - type: textarea\n    id: steps\n    attributes:\n      label: Passos para reproduzir\n      description: Explique o perfil utilizado e a sequência de ações.\n    validations:\n      required: true\n  - type: textarea\n    id: expected\n    attributes:\n      label: Comportamento esperado e observado\n    validations:\n      required: true\n  - type: input\n    id: environment\n    attributes:\n      label: Ambiente\n      description: \"Versão do app, Android e Expo Go ou APK.\"\n",
  "docs/releases/SHA256SUMS-1.7.4.txt": "b83141bdd58f86a4474566ae028b305dc9622e0581081e51064015d0a5acb01b  MoniMob-Android.apk\n",
  ".github/workflows/ci.yml": "name: CI\n\non:\n  push:\n    branches: [main]\n  pull_request:\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\nconcurrency:\n  group: monimob-${{ github.workflow }}-${{ github.ref }}\n  cancel-in-progress: true\n\njobs:\n  unit:\n    name: Código público e testes unitários\n    runs-on: ubuntu-latest\n    timeout-minutes: 15\n    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: |\n            backend/package-lock.json\n            mobile-expo/package-lock.json\n      - run: node scripts/check-public.mjs\n      - run: npm ci --prefix backend --no-fund --no-audit\n      - run: npm ci --prefix mobile-expo --no-fund --no-audit\n      - run: npm test\n\n  firebase:\n    name: Integração com Firebase emulado\n    runs-on: ubuntu-latest\n    timeout-minutes: 25\n    env:\n      GCLOUD_PROJECT: demo-monimob\n      GEMINI_API_KEY: ''\n      GOOGLE_APPLICATION_CREDENTIALS: ''\n    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020\n        with:\n          node-version: '22'\n          cache: npm\n          cache-dependency-path: |\n            backend/package-lock.json\n            tests/firestore/package-lock.json\n      - uses: actions/setup-java@cf277c60eb25467037889841efdb72551f06f6c3\n        with:\n          distribution: temurin\n          java-version: '21'\n      - run: npm ci --prefix backend --no-fund --no-audit\n      - run: npm ci --prefix tests/firestore --no-fund --no-audit\n      - name: Executar regras e fluxos completos\n        run: >\n          ./tests/firestore/node_modules/.bin/firebase emulators:exec\n          --project demo-monimob --only firestore,auth\n          \"node scripts/run-emulator-tests.mjs\"\n\n  release:\n    name: Verificar e publicar APK preparado\n    if: github.event_name == 'push' && github.ref == 'refs/heads/main'\n    needs: [unit, firebase]\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    permissions:\n      contents: write\n    env:\n      GH_TOKEN: ${{ github.token }}\n    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n        with:\n          fetch-depth: 0\n      - name: Publicar somente o rascunho verificado da versão 1.7.4\n        shell: bash\n        run: |\n          set -euo pipefail\n          gh api \"repos/$GITHUB_REPOSITORY/releases\" > \"$RUNNER_TEMP/releases.json\"\n          release_id=\"$(node -e \"const r=require(process.argv[1]).find(x=>x.tag_name==='v1.7.4'&&x.draft); if(r)process.stdout.write(String(r.id))\" \"$RUNNER_TEMP/releases.json\")\"\n          if [ -z \"$release_id\" ]; then\n            echo \"Nenhum rascunho pendente para publicar.\"\n            exit 0\n          fi\n          target=\"$(node -e \"const r=require(process.argv[1]).find(x=>String(x.id)===process.argv[2]);process.stdout.write(r.target_commitish)\" \"$RUNNER_TEMP/releases.json\" \"$release_id\")\"\n          git fetch origin \"$target\" --depth=1\n          git merge-base --is-ancestor \"$target\" HEAD\n          mkdir -p \"$RUNNER_TEMP/monimob-apk\"\n          gh release download v1.7.4 --repo \"$GITHUB_REPOSITORY\" --pattern MoniMob-Android.apk --dir \"$RUNNER_TEMP/monimob-apk\"\n          cp docs/releases/SHA256SUMS-1.7.4.txt \"$RUNNER_TEMP/monimob-apk/SHA256SUMS.txt\"\n          (cd \"$RUNNER_TEMP/monimob-apk\" && sha256sum -c SHA256SUMS.txt)\n          gh api --method PATCH \"repos/$GITHUB_REPOSITORY/releases/$release_id\" -F draft=false -f make_latest=true\n"
};
const expectedApk = 'b83141bdd58f86a4474566ae028b305dc9622e0581081e51064015d0a5acb01b';
const expectedBase = 'f86e9f9cc7a3dc390a1fd752554480b0745fb829';
const ownerRepo = 'mariomont30/MoniMob';
const branch = 'release/1.7.4-portfolio';
const root = path.resolve(process.argv[2] || '');
const toolsRoot = path.resolve(process.argv[3] || '');
const repo = path.join(root, 'repo');
const privateDir = path.join(root, 'private');
const output = path.join(root, 'publication');
const workspaceWork = path.dirname(root);
const env = { ...process.env, TEMP: path.join(root,'tmp'), TMP: path.join(root,'tmp'), npm_config_cache: path.join(root,'npm-cache'), GEMINI_API_KEY: '', GOOGLE_APPLICATION_CREDENTIALS: '' };
let needles = [];
const sha = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
function check(ok, message) { if (!ok) throw new Error(message); }
function inside(base, target) {
  const relative = path.relative(base, target);
  return relative !== '..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
}
function command(exe, args, { cwd = repo, capture = false, allowedFailure = false } = {}) {
  const r = cp.spawnSync(exe, args, {cwd,env,encoding: capture ? 'utf8' : undefined,stdio: capture ? ['ignore','pipe','pipe'] : 'inherit',windowsHide:true,maxBuffer:64*1024*1024});
  if (r.error) throw new Error('Não foi possível iniciar '+path.basename(exe)+': '+r.error.message);
  if (r.status !== 0 && !allowedFailure) throw new Error(path.basename(exe)+' retornou código '+r.status+'. A publicação foi interrompida.');
  return capture ? (r.stdout || '') : r.status;
}
const git = fs.existsSync(path.join(path.parse(root).root,'Program Files','Git','cmd','git.exe')) ?
  path.join(path.parse(root).root,'Program Files','Git','cmd','git.exe') : 'git';
const gh = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:/Program Files','GitHub CLI','gh.exe') : 'gh';
const npmCli = path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
function g(args, opts={}) { return command(git, args, opts); }
function h(args, opts={}) { return command(gh, args, opts); }
function write(relative, data) {
  const target = path.resolve(repo,relative);
  check(inside(repo,target),'Destino fora do checkout.');
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,data,'utf8');
}
function walk(base, accept, result=[]) {
  for (const entry of fs.readdirSync(base,{withFileTypes:true})) {
    const p=path.join(base,entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!['node_modules','.git','.local-runtime','.gradle','.expo','build'].includes(entry.name)) walk(p,accept,result);
    } else if (entry.isFile() && accept(p)) result.push(p);
  }
  return result;
}
function remember(value) {
  if (typeof value !== 'string' || value.length < 14 || /^(\[|example|your-|sua-|preencha)/i.test(value)) return;
  for (const v of [value, JSON.stringify(value).slice(1,-1), Buffer.from(value).toString('base64')]) {
    if (v.length >= 14) needles.push(Buffer.from(v));
  }
  needles.push(Buffer.from(value,'utf16le'));
}
function scanKnown(buffer, label) {
  for (const n of needles) if (buffer.includes(n)) throw new Error('Possível credencial privada em '+label+'. Nenhum valor foi exibido.');
}
function forbidden(relative) {
  const p = relative.replaceAll('\\','/');
  return /(^|\/)(node_modules|credentials|\.local-runtime|\.git|\.expo|\.gradle)(\/|$)/i.test(p)
    || /(^|\/)\.env(?!\.example$)[^/]*$/i.test(p)
    || /\.(apk|aab|zip|keystore|jks|pem|p12|pfx|log|exe|download)$/i.test(p)
    || /(^|\/)local\.properties$/i.test(p);
}
function publicList() {
  return [...new Set(g(['ls-files','-z','--cached','--others','--exclude-standard'],{capture:true}).split('\0').filter(Boolean))]
    .filter(p=>fs.existsSync(path.join(repo,p)));
}
function scanPublic(list) {
  for (const name of list) {
    check(!forbidden(name),'Arquivo não permitido na versão pública: '+name);
    const p=path.resolve(repo,name);
    check(inside(repo,fs.realpathSync(p)),'Link fora do checkout: '+name);
    const b=fs.readFileSync(p);
    scanKnown(b,name);
    const text=b.toString('utf8');
    check(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),'Chave privada em '+name);
    check(!/AIza[0-9A-Za-z_-]{30,}/.test(text),'Configuração Firebase real em '+name);
    check(!/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/.test(text),'Token em '+name);
  }
}
async function scanApk(file) {
  const yauzl=require(path.join(workspaceWork,'public-asset-tools','node_modules','yauzl'));
  await new Promise((resolve,reject)=>yauzl.open(file,{lazyEntries:true},(err,zip)=>{
    if(err)return reject(err);
    zip.on('error',reject);
    zip.on('end',resolve);
    zip.on('entry',entry=>{
      if(entry.fileName.endsWith('/'))return zip.readEntry();
      if(entry.uncompressedSize>150*1024*1024)return reject(new Error('Entrada APK excede o limite de inspeção.'));
      zip.openReadStream(entry,(err,stream)=>{
        if(err)return reject(err);
        const chunks=[];
        stream.on('error',reject);
        stream.on('data',c=>chunks.push(c));
        stream.on('end',()=>{
          try{scanKnown(Buffer.concat(chunks),'APK/'+entry.fileName);zip.readEntry();}catch(e){zip.close();reject(e);}
        });
      });
    });zip.readEntry();
  }));
}
function linksOkay(names) {
  for(const name of names){
    const source=fs.readFileSync(path.join(repo,name),'utf8');
    const targets=[...source.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map(x=>x[1].trim().replace(/^<|>$/g,''));
    for(let target of targets){
      if(/^(https?:|mailto:|#)/i.test(target))continue;
      target=decodeURIComponent(target.split('#')[0]);
      if(!target)continue;
      check(fs.existsSync(path.resolve(path.dirname(path.join(repo,name)),target)),'Link local ausente em '+name+': '+target);
    }
  }
}
(async()=>{
  check(process.argv[2] && process.argv[3],'Informe a pasta de preparação e a pasta de ferramentas.');
  check(fs.existsSync(path.join(repo,'.git')) && fs.existsSync(privateDir),'Preparação local não encontrada. Nenhum arquivo foi publicado.');
  check(fs.existsSync(npmCli),'npm local não encontrado junto ao Node.js.');
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(env.TEMP,{recursive:true});
  check(h(['api','user','--jq','.login'],{capture:true}).trim()==='mariomont30','A conta ativa não é mariomont30.');
  const headers=h(['api','-i','user'],{capture:true});
  if(/x-oauth-scopes:/i.test(headers)&&!/^x-oauth-scopes:.*\bworkflow\b/im.test(headers)){
    console.log('O GitHub pode solicitar autorização do escopo workflow para os testes do repositório.');
    h(['auth','refresh','--hostname','github.com','--scopes','workflow']);
  }
  check(g(['remote','get-url','origin'],{capture:true}).trim().replace(/\.git$/,'')==='https://github.com/'+ownerRepo,'O checkout não aponta para o repositório esperado.');
  check(g(['rev-parse','HEAD'],{capture:true}).trim()===expectedBase || g(['branch','--show-current'],{capture:true}).trim()===branch,'O checkout mudou. É necessária nova revisão antes de publicar.');

  console.log('1/7 Revisando a configuração privada sem mostrar valores...');
  for(const p of walk(privateDir,p=>/\.json$/i.test(p))){
    try{const j=JSON.parse(fs.readFileSync(p,'utf8'));if(j.type==='service_account'){remember(j.private_key);remember(j.private_key_id);remember(j.client_email);}}catch(e){if(e.message.startsWith('Possível'))throw e;}
  }
  for(const p of walk(privateDir,p=>/(^|[\\/])\.env(?:\.[^\\/]*)?$/.test(p)&&!p.endsWith('.example'))){
    for(const line of fs.readFileSync(p,'utf8').split(/\r?\n/)){
      const m=line.match(/^\s*([A-Z_][A-Z_0-9]*)\s*=\s*(.*?)\s*$/);
      if(m&&/(GEMINI.*KEY|SECRET|PASSWORD|TOKEN|PRIVATE_KEY)/.test(m[1]))remember(m[2].replace(/^["']|["']$/g,''));
    }
  }
  check(needles.length>=4,'Não foi possível carregar as referências privadas para a revisão. Publicação interrompida.');

  console.log('2/7 Concluindo a documentação e os testes do GitHub...');
  for(const [name,data] of Object.entries(files))write(name,data);
  const ignore=path.join(repo,'.gitignore');
  for(const line of ['tools/*.download','tmp/'])if(!fs.readFileSync(ignore,'utf8').split(/\r?\n/).includes(line))fs.appendFileSync(ignore,'\n'+line+'\n');
  const lintFile=path.join(repo,'.markdownlint.json');
  const lint=fs.existsSync(lintFile)?JSON.parse(fs.readFileSync(lintFile,'utf8')):{default:true};
  lint.MD033={allowed_elements:['img','br']};write('.markdownlint.json',JSON.stringify(lint,null,2)+'\n');
  const puml='docs/diagrams/use-cases.puml';
  write(puml,fs.readFileSync(path.join(repo,puml),'utf8').replace(/^@startuml[^\r\n]*/,'@startuml'));
  const obsolete=path.resolve(repo,'docs/diagrams/MoniMob-Use-Cases.svg');
  check(inside(repo,obsolete),'Destino inválido.');
  if(fs.existsSync(obsolete))fs.unlinkSync(obsolete);
  const jar=path.join(root,'tools','plantuml.jar');
  check(sha(fs.readFileSync(jar))==='e9bc9e6b2eb715e8c0c929f3dcb5fc1923be13f37599b09c293c66d354e88686','O PlantUML não passou na verificação de integridade.');
  const java=path.join(toolsRoot,'gradle','jdks','eclipse_adoptium-17-amd64-windows.2','bin','java.exe');
  command(java,['-Djava.awt.headless=true','-jar',jar,'-tsvg','-charset','UTF-8',path.join(repo,puml)]);
  check(fs.existsSync(path.join(repo,'docs/diagrams/use-cases.svg')),'O diagrama não foi gerado.');
  const prettier=require(path.join(workspaceWork,'markdown-validation-tools','node_modules','prettier'));
  const docs=['README.md','README.en.md',...Object.keys(files).filter(p=>p.endsWith('.md'))];
  for(const name of docs)write(name,await prettier.format(fs.readFileSync(path.join(repo,name),'utf8'),{parser:'markdown',printWidth:80,proseWrap:'always'}));
  const lintModulePath=require.resolve('markdownlint/promise',{paths:[path.join(workspaceWork,'markdown-validation-tools')]});
  const lintModule=await import(pathToFileURL(lintModulePath).href);
  const lintResult=await lintModule.lint({files:docs.map(p=>path.join(repo,p)),config:lint});
  const lintProblems=Object.entries(lintResult).filter(([,errors])=>Array.isArray(errors)&&errors.length);
  if(lintProblems.length){
    for(const [p,errors] of lintProblems)console.log(path.relative(repo,p)+': '+errors.map(e=>e.lineNumber+'/'+e.ruleNames[0]).join(', '));
    throw new Error('A documentação ainda contém avisos de Markdown.');
  }
  linksOkay(docs);

  console.log('3/7 Verificando código e executando os testes locais...');
  scanPublic(publicList());
  const packageJson=JSON.parse(fs.readFileSync(path.join(repo,'package.json'),'utf8'));
  for(const name of ['iniciar','instalar','diagnostico','firebase:regras'])check(packageJson.scripts?.[name],'Comando documentado ausente: '+name);
  command(process.execPath,['scripts/check-public.mjs']);
  command(process.execPath,[npmCli,'test']);
  g(['diff','--check']);
  for(const folder of ['backend','mobile-expo']){
    const result=command(process.execPath,[npmCli,'audit','--omit=dev','--json'],{cwd:path.join(repo,folder),capture:true,allowedFailure:true});
    let audit;try{audit=JSON.parse(result);}catch{throw new Error('Não foi possível verificar as dependências de '+folder);}
    check(audit.metadata && audit.metadata.vulnerabilities,'Auditoria de dependências indisponível em '+folder);
    fs.writeFileSync(path.join(output,'dependencies-'+folder+'.json'),JSON.stringify(audit,null,2));
    const v=audit.metadata.vulnerabilities;
    console.log(folder+': '+v.critical+' crítica(s), '+v.high+' alta(s), '+v.moderate+' moderada(s).');
    check(v.critical===0 && v.high===0,'Dependências de produção precisam de revisão antes da publicação: '+folder);
  }

  console.log('4/7 Verificando APK, assinatura e QR Code...');
  const apk=path.join(privateDir,'apk','MoniMob-Privado-1.7.4.apk');
  check(sha(fs.readFileSync(apk))===expectedApk,'O APK difere da versão previamente analisada.');
  await scanApk(apk);
  const apkOut=path.join(output,'MoniMob-Android.apk');fs.copyFileSync(apk,apkOut);
  const signer=path.join(toolsRoot,'android-sdk','build-tools','37.0.0','lib','apksigner.jar');
  command(java,['-jar',signer,'verify','--verbose',apkOut]);
  const sharp=require(path.join(workspaceWork,'public-asset-tools','node_modules','sharp'));
  const jsQR=require(path.join(workspaceWork,'public-asset-tools','node_modules','jsqr'));
  const decoded=await sharp(path.join(repo,'docs/assets/monimob-apk-qr.png')).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const qr=jsQR(new Uint8ClampedArray(decoded.data),decoded.info.width,decoded.info.height);
  check(qr&&qr.data==='https://github.com/'+ownerRepo+'/releases/download/v1.7.4/MoniMob-Android.apk','O QR Code não aponta para o APK esperado.');
  fs.copyFileSync(path.join(repo,'docs/releases/SHA256SUMS-1.7.4.txt'),path.join(output,'SHA256SUMS.txt'));

  console.log('5/7 Preparando commit público em uma branch separada...');
  g(['fetch','origin','main']);
  check(g(['rev-parse','origin/main'],{capture:true}).trim()===expectedBase,'A branch main foi alterada. Precisa de nova revisão antes de prosseguir.');
  const current=g(['branch','--show-current'],{capture:true}).trim();
  if(current!==branch)g(['switch','-c',branch]);
  scanPublic(publicList());
  g(['add','--all']);
  const tracked=g(['ls-files','-z'],{capture:true}).split('\0').filter(Boolean);
  scanPublic(tracked);
  check(tracked.length<1000,'Quantidade inesperada de arquivos para publicar.');
  const changed=g(['diff','--cached','--name-only'],{capture:true}).trim();
  if(changed)g(['-c','user.name=Mário_DEV','-c','user.email=156594731+mariomont30@users.noreply.github.com','commit','-m','feat: publish MoniMob 1.7.4 portfolio source and documentation']);
  const commit=g(['rev-parse','HEAD'],{capture:true}).trim();
  const helper='!"'+gh.replaceAll('\\','/')+'" auth git-credential';
  g(['-c','credential.helper=','-c','credential.helper='+helper,'push','origin','HEAD:refs/heads/'+branch]);

  console.log('6/7 Preparando release em rascunho, sem publicar o ZIP privado...');
  const notes=[
    '# MoniMob 1.7.4',
    '',
    'Distribuição acadêmica Android com os perfis Professor, Monitor e Aluno, materiais com revisão, favoritos, monitorias, relatórios e MoniBot.',
    '',
    'O APK precisa de backend ativo; esta release não oferece hospedagem permanente. A conexão é descoberta automaticamente pela configuração de execução.',
    '',
    'Versão nativa: 1.7.4-private, código 22. Android 7 ou superior.',
    'O pacote publicado foi verificado para não incluir a chave Gemini nem a credencial administrativa do Firebase. Identificadores públicos do cliente Firebase fazem parte da configuração do Android.',
    '',
    'Baixe MoniMob-Android.apk e confira SHA256SUMS.txt antes de instalar.',
    'A ativação de um perfil confirma o e-mail; a aprovação acadêmica se aplica aos vínculos e materiais.',
    '',
    'Código e guias de configuração estão no repositório. Não é necessário nem apropriado enviar o ZIP privado para utilizar esta release.'
  ].join('\n');
  const notesPath=path.join(output,'release-notes.md');fs.writeFileSync(notesPath,notes);
  const releases=JSON.parse(h(['api','repos/'+ownerRepo+'/releases?per_page=100'],{capture:true}));
  const existing=releases.find(r=>r.tag_name==='v1.7.4');
  check(!existing||existing.draft,'A versão 1.7.4 já está publicada; não será sobrescrita.');
  if(existing)h(['release','edit','v1.7.4','--repo',ownerRepo,'--target',commit,'--notes-file',notesPath]);
  else h(['release','create','v1.7.4','--repo',ownerRepo,'--target',commit,'--title','MoniMob 1.7.4','--draft','--notes-file',notesPath]);
  h(['release','upload','v1.7.4',apkOut,path.join(output,'SHA256SUMS.txt'),path.join(repo,'docs/assets/monimob-apk-qr.png'),'--repo',ownerRepo,'--clobber']);
  const prs=JSON.parse(h(['pr','list','--repo',ownerRepo,'--head',branch,'--json','number,url'],{capture:true}));
  if(!prs.length){
    const bodyPath=path.join(output,'pr-body.md');
    fs.writeFileSync(bodyPath,'Atualiza o código público para a distribuição acadêmica 1.7.4, com documentação de portfólio, configuração sem segredos, casos de uso em PlantUML e CI.\n\nValidação local: testes do projeto, revisão de arquivos públicos, referências privadas, SHA-256 e assinatura do APK e destino do QR Code. As integrações Firebase serão verificadas pelo CI. A release permanece em rascunho até a integração em main após aprovação dos testes. O backend continua necessário para utilizar a distribuição Android.');
    h(['pr','create','--repo',ownerRepo,'--base','main','--head',branch,'--title','MoniMob 1.7.4: código, documentação e distribuição Android','--body-file',bodyPath]);
  }else console.log(prs[0].url);
  h(['repo','edit',ownerRepo,'--description','MoniMob | Monitoria acadêmica com React Native, Expo, Firebase e Gemini. Professor, Monitor e Aluno.','--add-topic','react-native','--add-topic','expo','--add-topic','firebase','--add-topic','firestore','--add-topic','gemini','--add-topic','android','--add-topic','education','--add-topic','portfolio','--add-topic','plantuml'],{allowedFailure:true});
  h(['api','--method','PUT','repos/'+ownerRepo+'/private-vulnerability-reporting'],{allowedFailure:true});
  h(['api','--method','PUT','repos/'+ownerRepo+'/vulnerability-alerts'],{allowedFailure:true});
  console.log('7/7 Preparação concluída. A branch e o PR estão disponíveis para revisão; main ainda não foi alterada.');
  console.log('Volte ao chat e informe: preparação do GitHub concluída.');
})().catch(error=>{console.error('\nINTERROMPIDO: '+error.message);console.error('O ZIP privado não foi enviado. Informe esta mensagem no chat.');process.exitCode=1;});
