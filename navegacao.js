// navegacao.js - Navegação entre abas (VERSÃO CORRIGIDA)
(function() {
    var tentativasNavegacao = 0;
    var MAX_TENTATIVAS_NAVEGACAO = 50;

    function configurarNavegacao() {
        // CORREÇÃO: Usar .tab-link em vez de .tab-btn
        var tabs = document.querySelectorAll('.tab-link');
        if (!tabs || tabs.length === 0) {
            tentativasNavegacao++;
            if (tentativasNavegacao >= MAX_TENTATIVAS_NAVEGACAO) {
                console.warn('navegacao.js: nenhum .tab-link encontrado (tempo esgotado). Desistindo.');
                return;
            }
            // Se as abas não foram encontradas, tenta novamente após 100ms
            setTimeout(configurarNavegacao, 100);
            return;
        }

        var paginas = {
            'principal': 'index.html',
            'servidores': 'servidores.html',
            'atividades': 'atividades.html',
            'atribuicoes': 'atribuicoes.html',
            'visualizar': 'visualizar.html',
            'estatistica': 'estatistica.html'
        };

        for (var i = 0; i < tabs.length; i++) {
            // Remove todos os eventos anteriores
            var newTab = tabs[i].cloneNode(true);
            tabs[i].parentNode.replaceChild(newTab, tabs[i]);
            
            // Adiciona o evento de clique
            newTab.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                // Tentar navegar pelo href primeiro
                var href = this.getAttribute('href');
                if (href) {
                    window.location.href = href;
                    return;
                }
                
                var id = this.getAttribute('data-tab');
                if (paginas[id]) {
                    window.location.href = paginas[id];
                } else {
                    // Fallback por texto
                    var texto = this.textContent.trim();
                    if (texto.indexOf('Adicionar') !== -1 || texto === 'Adicionar/Atividades') {
                        window.location.href = 'atividades.html';
                    } else if (texto.indexOf('Atribuir') !== -1) {
                        window.location.href = 'atribuicoes.html';
                    } else if (texto.indexOf('Servidores') !== -1) {
                        window.location.href = 'servidores.html';
                    } else if (texto.indexOf('Principal') !== -1) {
                        window.location.href = 'index.html';
                    } else if (texto.indexOf('Distribuição') !== -1) {
                        window.location.href = 'visualizar.html';
                    } else if (texto.indexOf('Estatística') !== -1) {
                        window.location.href = 'estatistica.html';
                    }
                }
            });
        }
    }

    // Aguarda o DOM carregar completamente
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', configurarNavegacao);
    } else {
        configurarNavegacao();
    }
})();