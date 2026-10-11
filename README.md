![Painel do Clique Limpo com a proteção ativada](docs/images/painel.png)

# Clique Limpo

Extensão gratuita para Chrome e Microsoft Edge que ajuda a proteger interações em páginas com camadas transparentes, pop-ups e redirecionamentos publicitários. A proteção é ativada manualmente por aba e acompanha a navegação dentro do site escolhido.

**Versão atual: 1.0.1.** Não exige conta, assinatura, servidor de análise ou outro bloqueador. O processamento das páginas acontece no navegador.

## Instalação

[Baixar a versão mais recente](https://github.com/emanuelz-martins/clique-limpo/releases/latest/download/Clique-Limpo.zip) · [Consultar versões](https://github.com/emanuelz-martins/clique-limpo/releases)

### Chrome e Edge

1. Baixe o arquivo `Clique-Limpo.zip` e extraia seu conteúdo em uma pasta permanente.
2. Abra `chrome://extensions` no Chrome ou `edge://extensions` no Edge.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação** ou **Carregar descompactado**.
5. Selecione a pasta `clique-limpo`, que contém o arquivo `manifest.json`.
6. Recarregue as páginas abertas e fixe o ícone da extensão na barra do navegador.

Não é necessário instalar Node.js ou executar comandos para usar a extensão. Mantenha a pasta extraída no computador enquanto ela estiver instalada.

### Instalação pelas lojas

O Clique Limpo ainda não está publicado na Chrome Web Store ou no Microsoft Edge Add-ons. O botão de download do GitHub fornece o pacote para instalação manual; ele não instala a extensão automaticamente.

A instalação pelo botão da loja, com confirmação do navegador e atualizações automáticas, fica disponível após a publicação e aprovação em cada loja. As condições de distribuição estão nas documentações do [Chrome](https://developer.chrome.com/docs/extensions/how-to/distribute) e do [Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/hosting-and-updating). O repositório inclui um [guia de publicação](docs/PUBLICACAO.md) e um pacote próprio para envio às lojas.

## Como usar

Abra o site que deseja proteger e clique no ícone do Clique Limpo. No painel, pressione o botão com a carinha. A extensão ativa as regras de proteção e recarrega a página automaticamente para que o novo carregamento já aconteça protegido. Ela fica feliz quando a proteção está ativa e triste quando está desativada.

| Ação | Comportamento |
| --- | --- |
| Ativar pela carinha ou por uma dica | Protege o site naquela aba e recarrega a página uma vez. |
| Navegar para outra página do mesmo site | Mantém a proteção, inclusive ao recarregar ou usar o histórico. |
| Abrir um link interno em nova aba | A nova aba herda a ativação. |
| Abrir uma aba separadamente | Começa desativada, mesmo que o endereço seja igual. |
| Trocar de aba | Pausa a proteção da aba anterior; voltar a ela reativa a proteção sem recarregar. |
| Sair para outro site | Apaga a ativação naquela aba. |
| Desativar manualmente | Desliga sem recarregar; exige nova ativação. |
| Reiniciar o navegador ou recarregar a extensão | Exige nova ativação. |

O site é identificado por protocolo, domínio e porta. Preferências de compatibilidade do player são salvas localmente e não ativam a proteção por conta própria.

O ícone do GitHub no rodapé abre este repositório em uma nova aba. O aviso de recarregamento aparece no cabeçalho do painel e nas dicas de ativação.

## Recursos

- **Camadas invisíveis:** procura elementos transparentes ou quase transparentes sobre o conteúdo, oculta os suspeitos e tenta interceptar os cliques antes dos ouvintes do site.
- **Pop-ups e redirecionamentos:** intercepta formas conhecidas de abertura publicitária de janelas, links sintéticos e tentativas de sequestro da aba.
- **Rastreamento:** bloqueia requisições para uma lista local de domínios enquanto a proteção da aba selecionada está ativa.
- **Players de vídeo:** inclui ajustes para configurações publicitárias de players compatíveis, tentativas de pausa forçada e preservação da faixa de áudio escolhida em integrações suportadas.
- **Controle manual:** permite verificar novamente a página, escolher um elemento para ocultar ou restaurar os elementos e desativar a proteção. A ocultação manual é temporária.
- **Dicas de uso:** explica a ativação na primeira abertura do painel e sugere proteção quando encontra uma camada suspeita em uma página desativada.

Se o vídeo não iniciar, experimente **Destravar player de vídeo** no painel e recarregue a página. Essa opção prioriza a configuração original e os controles do player; anúncios dentro do próprio player podem reaparecer.

Os contadores do painel correspondem à página principal e à visita atual. Não agregam os contadores dos frames internos.

## Dicas na página

![Aviso de orientação do Clique Limpo](docs/images/dica.png)

As dicas usam uma inspeção local e limitada, sem ativar o bloqueio sozinhas. O usuário pode selecionar **Ativar proteção**, **Agora não** ou **Não mostrar mais dicas**. A preferência pode ser alterada no rodapé do painel.

Para evitar interrupções, os avisos respeitam um intervalo global de dez minutos na sessão e aparecem no máximo uma vez por origem a cada sete dias. Desaparecem após 25 segundos, ao trocar de aba ou ao ativar a proteção. A inspeção de dicas examina no máximo 1.800 elementos por varredura e evita avisos durante reprodução de mídia detectável naquele documento.

## Privacidade e permissões

Não há telemetria, sincronização de preferências, código remoto ou envio de conteúdo das páginas para um serviço da extensão. O armazenamento local contém preferências do player e das dicas, além de até 64 origens e datas de avisos para controlar sua frequência. A ativação por aba fica na memória da sessão.

| Permissão | Finalidade |
| --- | --- |
| Acesso a páginas HTTP e HTTPS | Inspecionar camadas e aplicar proteção na página principal e nos frames. |
| `storage` | Guardar preferências, frequência de dicas e estado da sessão. |
| `webNavigation` | Acompanhar navegação no site e novas abas abertas por links internos. |
| `declarativeNetRequestWithHostAccess` | Aplicar regras de rede limitadas às abas protegidas. |

Consulte a [política de privacidade](docs/PRIVACIDADE.md) para conhecer os dados utilizados e como removê-los.

## Limitações

A detecção é heurística: pode deixar passar anúncios ou classificar um elemento legítimo incorretamente. A extensão não garante anonimato, bloqueio de todos os anúncios ou invisibilidade aos mecanismos que detectam bloqueadores.

Ativar depois do carregamento não desfaz cliques ou scripts já executados. A proteção não corrige indisponibilidade de servidores, arquivos de vídeo ausentes ou restrições de incorporação. Também não elimina registros do próprio servidor do site, identificação por login ou fingerprinting.

Regras de rede podem afetar funções legítimas. Se algo deixar de funcionar, desative a proteção, restaure os elementos ou use a opção do player. Páginas internas do navegador e lojas de extensões não recebem a proteção.

## Desenvolvimento e distribuição

```text
clique-limpo/       Código instalável da extensão
docs/              Imagens, privacidade e guias
demo/              Demonstração local com camadas simuladas
tests/             Testes da extensão real em navegador isolado
scripts/           Verificação, geração de ícones e empacotamento
.github/workflows/ Validação e releases automáticas
```

O GitHub Actions verifica o projeto e executa os testes. Tags no formato `v1.0.1` geram uma release com `Clique-Limpo.zip`, `Clique-Limpo-loja.zip` e suas somas SHA-256, depois que os testes passam. O segundo ZIP contém `manifest.json` na raiz e é destinado aos painéis das lojas.

As releases do GitHub não atualizam instalações manuais automaticamente. Veja os guias de [desenvolvimento](docs/DESENVOLVIMENTO.md) e [publicação](docs/PUBLICACAO.md).

Para informar um problema, abra uma [issue](https://github.com/emanuelz-martins/clique-limpo/issues) com navegador, versão da extensão e passos para reproduzir. Remova informações pessoais antes de anexar imagens ou registros.

O ícone do GitHub é do projeto [Octicons](https://github.com/primer/octicons), sob [licença MIT](clique-limpo/icons/GITHUB-LICENSE.txt).
