# MoniMob no Android

## Instalar o APK disponível

[Baixar MoniMob para Android — versão 1.0.3-qa](https://github.com/mariomont30/MoniMob/releases/download/v1.0.3-qa/MoniMob-Android.apk)

![QR Code para baixar o APK](../assets/monimob-apk-qr.png)

1. Abra o link ou aponte a câmera do celular para o QR Code.
2. Baixe `MoniMob-Android.apk` pela página oficial deste repositório.
3. Abra o arquivo e conceda a autorização de instalação dessa origem se o Android solicitar.
4. Abra o MoniMob e entre com sua conta ou cadastre uma conta de aluno. No novo cadastro, confirme o e-mail pelo link enviado pelo Firebase antes de entrar.

O APK contém o aplicativo e dispensa Expo Go. Esta distribuição é uma **versão de testes**, assinada, compatível com Android 7.0 ou superior e processadores ARM64 ou x86_64. O acesso às funções remotas exige internet.

**Disponibilidade do serviço:** esta versão está configurada para um backend HTTPS temporário, executado no computador responsável pelos testes. O servidor e o túnel precisam estar ativos. Instalar o APK não mantém o servidor funcionando, e o endereço pode mudar quando o túnel é recriado. Se isso acontecer, uma nova compilação precisa receber o endereço válido.

O arquivo `SHA256SUMS.txt` da release permite conferir a integridade do APK baixado. Para atualizar uma instalação existente preservando os dados, o Android exige o mesmo identificador do aplicativo e a mesma identidade de assinatura.

## Executar o código com Expo

Configure o ambiente conforme o [guia de configuração](../CONFIGURACAO.md) e execute na raiz:

```bash
npm ci --prefix mobile-expo
npm run start:mobile
```

Use um Expo Go compatível com **SDK 58** ou uma compilação de desenvolvimento compatível. O QR Code gerado pelo terminal do Expo abre a sessão de desenvolvimento; o QR Code desta página baixa o APK da release.

## Gerar uma compilação Android

Use Node.js 22, JDK 17, Android SDK e as versões de ferramentas definidas no projeto Gradle. Configure `ANDROID_HOME` ou o arquivo local `mobile-expo/android/local.properties` para apontar para seu SDK. Esse arquivo é ignorado pelo Git.

Depois de preencher `mobile-expo/.env`:

```powershell
cd mobile-expo
npm ci
npm run android
```

O Android Gradle Plugin utiliza sua chave local de desenvolvimento para a variante `debug`; nenhuma chave é distribuída neste repositório.

Para uma release, gere e armazene sua chave de assinatura em local privado e forneça as variáveis ao processo de compilação:

| Variável | Conteúdo local |
|:--|:--|
| `MONIMOB_SIGNING_STORE_FILE` | Caminho absoluto do arquivo de assinatura |
| `MONIMOB_SIGNING_ALIAS` | Alias da chave |
| `MONIMOB_SIGNING_PASSWORD` | Senha do arquivo e da chave |

```powershell
cd mobile-expo/android
.\gradlew.bat assembleRelease -PmonimobVersionCode=4 -PmonimobVersionName=1.0.3-qa
```

O APK gerado fica em `mobile-expo/android/app/build/outputs/apk/release/`. Use um `versionCode` maior para distribuir uma atualização. A chave de uma nova instalação própria é diferente da usada na release disponibilizada aqui; mantenha sua identidade de assinatura privada e faça backup seguro dela.
