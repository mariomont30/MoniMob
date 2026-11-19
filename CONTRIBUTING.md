# Como contribuir

Abra uma issue descrevendo o problema, o comportamento esperado e os passos para
reproduzir. Não inclua senhas, tokens, dados pessoais ou configurações privadas
nos anexos.

Para contribuir com código:

1. Crie uma branch com uma alteração de escopo claro.
2. Configure seu próprio ambiente conforme [o guia](docs/CONFIGURACAO.md).
3. Preserve a coerência das regras entre mobile e backend.
4. Execute os testes aplicáveis e o verificador de arquivos públicos.
5. Atualize a documentação quando o comportamento mudar.
6. Abra um pull request explicando a mudança e a validação realizada.

Use dados de teste nos emuladores. Não envie bancos reais, arquivos `.env`,
credenciais administrativas, chaves de assinatura, `node_modules` ou caches.
Artefatos Android devem ser distribuídos pelas releases, após verificação.
