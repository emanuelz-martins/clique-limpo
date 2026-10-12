# Contenção de aberturas no TopFlix — 1.0.4

O relatório fornecido pelo mantenedor descreveu um carregador em `tontonsfilmeurs.com` que cria um iframe oculto, obtém seu `window.open` imediatamente e abre uma janela vazia. A janela recebe um documento com redirecionamento por meta refresh. A análise original não reproduziu uma impressão publicitária real.

O teste local com a extensão 1.0.3 reproduziu a abertura síncrona: a chamada retornou uma janela quando deveria retornar `null`. A mesma reprodução passa na 1.0.4. Nenhum anúncio real foi executado; os testes usam um servidor local, com os domínios resolvidos para esse servidor no perfil isolado.

## Alterações

- O hook MAIN protege o acesso a `contentWindow` e `contentDocument` de iframes da mesma origem antes de entregar a referência ao código da página. A função obtida acompanha a ativação da origem, mesmo quando foi guardada antes da ativação ou quando o iframe é aninhado.
- As regras de rede e a contenção de aberturas acompanham a ativação manual, mesmo em segundo plano. A inspeção visual mantém a pausa ao trocar de aba. Desativar manualmente remove as regras daquela aba.
- Os scripts em `mequyvgfqzj.com`, `zxggtzxmgijtea.com` e `adsco.re` são bloqueados. A regra CloudFront limita-se a `d2klx87bgzngce.cloudfront.net/H/njson2csv.umd.min.js`, sem bloquear outros arquivos do CDN. O tipo de recurso é considerado, inclusive quando um script termina em `.css`.
- O worker usa os eventos de criação de alvos e verifica novamente as abas recém-criadas. Isso cobre janelas vazias que inicialmente não expõem URL ou origem, inclusive quando o script remove `window.opener`.
- Em `tontonsfilmeurs.com`, novas abas dependem de autorização específica do fluxo isolado de links e formulários. Links internos mantêm a ativação; destinos externos autorizados começam desligados. Abas criadas separadamente não recebem ativação só por terem um `openerTabId`.
- Formulários recebem uma autorização de uso único, vinculada ao documento e ao hash do destino, válida por três segundos. A intenção precisa vir do botão de envio ou de Enter em um controle daquele formulário; `requestSubmit()` sozinho ou disparado pelo clique no player não autoriza um formulário oculto. Links usam abas preparadas pelo worker, identificadas por seu ID. Não existe uma autorização genérica baseada apenas em um clique recente.
- Destinos publicitários conhecidos na própria aba são bloqueados, preservando a ativação e restaurando a última página protegida.
- O painel consulta a sessão e o estado atual da aba para indicar a ativação, mesmo quando a atualização do content script ainda está pendente após uma troca de aba.

## Verificação

`npm run test:popups` verifica a criação síncrona do iframe, referências guardadas, acesso por documento e por iframe aninhado, compatibilidade do player, redirecionamento de janela vazia, evento DOM falso de desativação, carregadores alternativos, foco, recuperação das regras de sessão, navegação a destino conhecido, links normais e modificados, janelas nomeadas, `base[target]`, formulários GET/POST, código inline durante o carregamento e desativação manual.

Os testes existentes continuam verificando reprodução, pausa, faixa de áudio, overlays, seleção manual, navegação interna, painel e dicas. A recuperação de sessão é verificada chamando a inicialização com o estado existente; isso não simula todas as condições de encerramento do processo do navegador.

## Limites

O bloqueio síncrono e o fechamento posterior são defesas diferentes. A contenção pelo worker ocorre depois da criação e pode permitir uma requisição inicial ou uma janela breve. A [documentação de webNavigation](https://developer.chrome.com/docs/extensions/reference/api/webNavigation) também não garante ordenação com os eventos de rede.

O canal DOM do hook MAIN não é uma fronteira de autenticação. O estado do worker e as regras de rede não são desativados por esses eventos; o teste de evento falso verifica a contenção posterior, sem prometer que o hook MAIN seja inviolável.

Não foi validada uma sessão publicitária no TopFlix real. Domínios novos, relações de origem não expostas pelo navegador, redirecionamentos desconhecidos na própria aba e abertura de aplicativos externos podem exigir outras medidas. A política mais restrita pode afetar janelas abertas por scripts de login ou pagamento; links e formulários comuns são verificados, mas não todas as integrações possíveis.
