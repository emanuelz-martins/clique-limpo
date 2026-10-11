# Publicação e instalação pelas lojas

## Estado atual

A extensão ainda não tem uma página aprovada na Chrome Web Store ou no Microsoft Edge Add-ons. Um ZIP do GitHub não instala diretamente uma extensão em um navegador de uso pessoal. Instalação por políticas corporativas é um fluxo distinto para ambientes gerenciados.

Para oferecer um botão de instalação com confirmação do navegador, é necessário publicar em uma loja compatível. Referências: [distribuição no Chrome](https://developer.chrome.com/docs/extensions/how-to/distribute), [publicação na Chrome Web Store](https://developer.chrome.com/docs/webstore/publish) e [publicação no Edge Add-ons](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

## Release no GitHub

Atualize versão e documentação, execute as verificações e envie o commit para `main`. Depois crie a tag correspondente:

```powershell
git tag v1.0.1
git push origin v1.0.1
```

O workflow **Validar e distribuir** testa em Edge com perfil isolado. Após os testes passarem, publica os pacotes:

| Arquivo | Destino |
| --- | --- |
| `Clique-Limpo.zip` | Instalação manual; inclui a pasta `clique-limpo` e documentação. |
| `Clique-Limpo-loja.zip` | Envio às lojas; contém `manifest.json` na raiz. |
| `SHA256SUMS.txt` | Integridade dos dois pacotes. |

Envios para `main`, pull requests e execuções manuais também geram artefatos, mas somente uma tag enviada publica uma release. A publicação nas lojas não está automatizada e não usa credenciais de desenvolvedor no repositório.

## Chrome Web Store

1. Acesse o [painel de desenvolvedor](https://chrome.google.com/webstore/devconsole) e conclua o cadastro exigido pela loja.
2. Crie um item e envie `Clique-Limpo-loja.zip`.
3. Preencha descrição, imagens, finalidade, permissões e declaração de dados.
4. Informe a [política de privacidade](https://github.com/emanuelz-martins/clique-limpo/blob/main/docs/PRIVACIDADE.md).
5. Confira a ficha e envie para análise. A loja determina aprovação e disponibilidade.
6. Após a publicação, adicione o endereço real do item ao README como **Instalar no Chrome**.

## Microsoft Edge Add-ons

1. Acesse o [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) e conclua o cadastro de desenvolvedor de extensões.
2. Crie uma extensão e envie `Clique-Limpo-loja.zip`.
3. Preencha disponibilidade, propriedades, privacidade, imagens e instruções de teste.
4. Confira a ficha e envie para certificação.
5. Após a publicação, adicione o endereço real do item ao README como **Instalar no Edge**.

## Textos sugeridos para a ficha

**Nome:** Clique Limpo

**Descrição curta:** Proteção manual por aba contra cliques invisíveis, pop-ups e rastreadores, com controles para players e dicas locais.

**Descrição:** Clique Limpo ajuda a evitar cliques indesejados em páginas com camadas transparentes e aberturas publicitárias. Ative pela carinha no painel. A proteção acompanha a navegação dentro do site naquela aba, pausa ao trocar de aba e reativa ao voltar. Inclui verificação de camadas, ocultação manual, compatibilidade de players e dicas opcionais. O processamento é local, sem conta, assinatura ou telemetria. A detecção é heurística e não garante bloquear todos os anúncios ou rastreadores.

**Finalidade:** Proteger as interações do usuário na aba escolhida contra camadas e aberturas publicitárias indesejadas.

Use a tabela de permissões do README e a política de privacidade nas declarações. Os registros locais das dicas contêm origens de sites; informe isso nos formulários, mesmo sem transmissão.

## Instruções de teste para revisão

Abra uma página HTTP ou HTTPS e confirme que o estado inicial é desativado. Ative pela carinha, navegue dentro da mesma origem e confirme a continuidade. Troque de aba e volte para conferir pausa e reativação. Teste a desativação manual e as dicas. O projeto inclui demonstração local e testes de camadas transparentes, players e pop-ups, sem depender de serviços externos de vídeo.

As imagens em `docs/images` mostram o painel real. Confira os requisitos atuais de tamanho e formato de cada loja antes de usá-las no formulário.
