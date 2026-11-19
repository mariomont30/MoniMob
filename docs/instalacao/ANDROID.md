# Android e APK

## Download

Baixe o
[APK da versão 1.7.4](https://github.com/mariomont30/MoniMob/releases/tag/v1.7.4).
O arquivo `MoniMob-Android.apk` requer Android 7 ou superior. A versão nativa do
pacote acadêmico é `1.7.4-private`, código 22.

O arquivo SHA-256 acompanha a release. Compare o resultado antes de instalar:

```powershell
Get-FileHash .\MoniMob-Android.apk -Algorithm SHA256
```

Autorize a instalação a partir da fonte utilizada quando o Android solicitar. Os
identificadores públicos do Firebase fazem parte da configuração do cliente; as
chaves administrativas e do Gemini pertencem ao servidor.

## Backend durante o uso

O APK contém o aplicativo, mas as operações de servidor precisam do backend
ativo. Esta distribuição acadêmica não inclui um serviço público permanente.
Execute `npm.cmd run iniciar` na raiz do projeto configurado e mantenha o
computador conectado. A descoberta de conexão é automática.

Uma release não significa disponibilidade contínua do backend. Para operação
independente do computador, ainda é necessário hospedar o servidor e configurar
um endereço estável.

## Gerar outro APK

Use as dependências fixadas no projeto, JDK 17 e Android SDK compatível. A
compilação nativa é diferente da execução pelo Expo Go e requer o ambiente
Android instalado.

Configure a assinatura fora do Git. As variáveis exigidas estão no bloco
`signingConfigs` de
[`mobile-expo/android/app/build.gradle`](../../mobile-expo/android/app/build.gradle).
Siga também o script de compilação disponível no projeto. Nunca versione o
arquivo da chave ou suas senhas.

Para usar um projeto Firebase próprio, configure o cliente e o backend para esse
mesmo projeto antes de gerar o APK. A configuração de exemplo não concede acesso
ao Firebase da distribuição acadêmica.
