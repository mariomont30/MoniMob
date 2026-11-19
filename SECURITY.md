# Segurança

Não publique vulnerabilidades com dados sensíveis em issues abertas. Use o
[relato privado do GitHub](https://github.com/mariomont30/MoniMob/security/advisories/new)
quando disponível. Não envie chaves ou informações pessoais na descrição.

## Informações privadas

Chaves do Gemini, credenciais do Firebase Admin SDK, tokens do GitHub e arquivos
de assinatura devem permanecer fora do repositório. O projeto fornece exemplos
sem valores privados e um verificador de arquivos públicos.

Os identificadores do cliente Firebase presentes em um APK não são credenciais
administrativas. A proteção dos dados também depende das regras do Firestore e
das verificações de autorização do backend.

O verificador reduz o risco de exposição, mas não detecta todos os formatos
possíveis de segredo. Revise o conteúdo antes de publicar. Se uma chave privada
for exposta, revogue-a ou substitua-a: apagar um arquivo não remove o segredo do
histórico nem invalida a credencial.

## Dependências

A CI verifica as dependências do backend e do mobile com `npm audit`, incluindo
as ferramentas de desenvolvimento. Alertas de qualquer gravidade interrompem
essa verificação e exigem revisão antes da integração.

O backend utiliza Firestore 9.4.1 ou superior. No Expo SDK 58, a dependência
`minimatch` de `@expo/fingerprint` está fixada na versão corrigida 11.0.9 por um
override específico. Um teste cobre a compatibilidade da seleção de arquivos e
das exceções de caminhos. Reavalie esse override quando o componente do Expo
passar a declarar uma versão corrigida por conta própria.
