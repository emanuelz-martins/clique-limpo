# Política de privacidade

Esta política descreve o comportamento do Clique Limpo 1.0.6.

## Processamento de páginas

A extensão inspeciona elementos das páginas HTTP e HTTPS e de seus frames para identificar camadas suspeitas. Com a proteção ativa, pode alterar temporariamente estilos, interceptar interações e aplicar regras de bloqueio de rede. Com a proteção desativada e as dicas habilitadas, realiza uma inspeção passiva e limitada para sugerir a ativação.

Esse processamento ocorre no navegador. O Clique Limpo não mantém um servidor de análise e não envia histórico, conteúdo de páginas, cliques ou preferências para serviços próprios ou terceiros. Não contém telemetria, anúncios próprios ou código carregado remotamente.

## Armazenamento

O armazenamento local, sem sincronização entre dispositivos, contém:

- Preferências do player associadas ao domínio do site.
- Preferência de exibição de dicas e confirmação da orientação inicial.
- Até 64 origens de sites que receberam uma dica, com a data do aviso, para limitar a repetição. Uma origem contém protocolo, domínio e porta, sem o caminho da página.

O armazenamento de sessão contém a ativação por aba e origem, o endereço da última página protegida para restaurar desvios conhecidos, as associações de abas abertas com autorização e o horário do último aviso global. A validação de formulários usa um hash SHA-256 do destino, o identificador do documento e um prazo de três segundos, sem armazenar os campos do formulário nem seu destino em texto nessa autorização. Autorizações expiradas não são aceitas e são removidas na reinicialização do serviço; fechar a aba de origem ou desativar a proteção remove suas autorizações. A ativação não é preservada após reiniciar o navegador ou recarregar a extensão. Contadores e elementos ocultados são mantidos no documento da página.

## Permissões

O acesso a páginas HTTP e HTTPS permite inspecionar e proteger o conteúdo. `storage` guarda os estados descritos acima. `webNavigation` acompanha navegações e novas abas. `declarativeNetRequestWithHostAccess` aplica regras de rede às abas manualmente protegidas, inclusive em segundo plano, sem ler o corpo das requisições. A API de abas permite abrir links autorizados e fechar alvos suspeitos associados à origem protegida.

As listas de domínios bloqueados são incluídas no pacote; não são baixadas automaticamente. A extensão não solicita permissão para notificações do sistema.

## Controle do usuário

A ativação é manual. O usuário pode pausar a proteção, restaurar elementos ocultados e desligar as dicas. Desativar e reativar as dicas no painel limpa os registros de frequência dos avisos. Para excluir todas as preferências e os registros locais da extensão, desinstale-a pelo gerenciador de extensões do navegador. Recarregue as páginas para remover os scripts e alterações da visita atual.

## Serviços do navegador

Os sites visitados continuam sujeitos às suas próprias políticas de privacidade. A distribuição e atualização pelas lojas, quando disponíveis, também seguem as políticas do navegador e da respectiva loja. O Clique Limpo não garante anonimato nem impede todas as formas de identificação ou rastreamento.

## Contato

Dúvidas sobre esta política podem ser registradas nas [issues do repositório](https://github.com/emanuelz-martins/clique-limpo/issues). Evite incluir informações pessoais em mensagens públicas.
