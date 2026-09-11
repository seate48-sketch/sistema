// common.js - Funções compartilhadas do sistema SEATE
// VERSÃO CORRIGIDA - SEM CONFLITO DE DECLARAÇÕES

// ============================================================
// ATENÇÃO: SUPABASE_URL, SUPABASE_ANON_KEY e TABLES
// são declarados no supabase-client.js e config.js
// Não declarar novamente aqui para evitar conflito!
// ============================================================

// Usar as variáveis globais declaradas no supabase-client.js

// ==================== LOG DE DEPURAÇÃO ====================
// Só imprime no console quando SUPABASE_CONFIG.DEBUG === true (ver config.js).
// Evita expor URL, contagens e estrutura interna no console em produção.
function logDebug() {
    if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.DEBUG) {
        console.log.apply(console, arguments);
    }
}
// Se não estiverem disponíveis, usar fallback

var usarSupabase = false;
var supabaseClient = null;

// Função para obter a URL do Supabase (usa a global declarada em supabase-client.js)
function getSupabaseUrl() {
    return typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : null;
}

// Função para obter a chave do Supabase (usa a global declarada em supabase-client.js)
function getSupabaseAnonKey() {
    return typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : null;
}

// Função para obter as tabelas (usa a global ou fallback)
function getTables() {
    return typeof TABLES !== 'undefined' ? TABLES : {
        SERVIDORES: 'servidores',
        ATIVIDADES: 'atividades',
        ATRIBUICOES: 'atribuicoes',
        REGISTROS: 'registros',
        CONFIGURACAO: 'configuracao',
        COMUNICADOS: 'comunicados',
        MENSAGEM_EMERGENTE: 'mensagem_emergente',
        MENSAGEM_EMERGENTE_VISTAS: 'mensagem_emergente_vistas',
        MENSAGENS_INDIVIDUAIS: 'mensagens_individuais',
        MENSAGENS_INDIVIDUAIS_VISTAS: 'mensagens_individuais_vistas',
        OBS_SERVIDORES: 'obs_servidores',
        LISTA_VISUALIZACAO: 'lista_visualizacao',
        DADOS_HISTORICOS: 'dados_historicos'
    };
}

// ==================== INICIALIZAÇÃO DO SUPABASE (COM RETRY) ====================
function initSupabase() {
    var SUPABASE_URL = getSupabaseUrl();
    var SUPABASE_ANON_KEY = getSupabaseAnonKey();
    
    try {
        // ============================================================
        // CORREÇÃO: reaproveitar o MESMO cliente que o supabase-client.js
        // já criou (variável "db"), em vez de criar um segundo cliente
        // independente aqui. Ter dois clientes separados (mesmo que
        // apontando pro mesmo projeto) faz cada um guardar sua PRÓPRIA
        // sessão de login na memória — então, ao fazer login por aqui
        // (supabaseClient), o outro cliente (db, usado por TODAS as
        // funções de salvar/excluir em supabase-client.js) nunca ficava
        // sabendo que você tinha logado, e continuava mandando as
        // requisições como visitante anônimo. Isso fazia toda operação
        // que exige login (comunicados, mensagens, atividades,
        // atribuições, configuração) falhar sem aviso nenhum — é a causa
        // raiz de vários dos problemas de "salvei mas não gravou".
        if (typeof db !== 'undefined' && db) {
            supabaseClient = db;
            usarSupabase = true;
            logDebug('✅ Supabase conectado com sucesso! (reaproveitando cliente único)');
            logDebug('📌 URL unificada:', SUPABASE_URL);
            return true;
        }

        if (typeof supabase !== 'undefined' && supabase.createClient) {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            usarSupabase = true;
            logDebug('✅ Supabase conectado com sucesso! (common.js)');
            logDebug('📌 URL unificada:', SUPABASE_URL);
            return true;
        }
        
        if (typeof createClient !== 'undefined') {
            supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            usarSupabase = true;
            logDebug('✅ Supabase conectado com sucesso! (createClient - common.js)');
            logDebug('📌 URL unificada:', SUPABASE_URL);
            return true;
        }
        
        console.warn('⚠️ Biblioteca do Supabase não encontrada. Tentando novamente...');
        setTimeout(function() {
            logDebug('🔄 Tentando reconectar ao Supabase...');
            if (typeof db !== 'undefined' && db) {
                supabaseClient = db;
                usarSupabase = true;
                logDebug('✅ Supabase conectado com sucesso! (retry - reaproveitando cliente único)');
                if (typeof carregarDados === 'function') {
                    carregarDados();
                }
            } else if (typeof supabase !== 'undefined' && supabase.createClient) {
                supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                usarSupabase = true;
                logDebug('✅ Supabase conectado com sucesso! (retry - common.js)');
                if (typeof carregarDados === 'function') {
                    carregarDados();
                }
            } else if (typeof createClient !== 'undefined') {
                supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                usarSupabase = true;
                logDebug('✅ Supabase conectado com sucesso! (retry createClient - common.js)');
                if (typeof carregarDados === 'function') {
                    carregarDados();
                }
            } else {
                console.warn('❌ Supabase não disponível após retry. Usando localStorage.');
                usarSupabase = false;
            }
        }, 500);
        
        return false;
        
    } catch (e) {
        console.warn('❌ Erro ao conectar Supabase (common.js):', e.message);
        console.warn('💾 Usando localStorage como fallback.');
        usarSupabase = false;
        return false;
    }
}

// ==================== AUTENTICAÇÃO (SÓ PÁGINAS ADMINISTRATIVAS) ====================
// registro.html NUNCA chama estas funções — servidores continuam acessando
// só pelo link (?user=Nome), sem login.

// Usada por index.html (que exibe o modal de login embutido em vez de redirecionar)
async function obterSessaoAtual() {
    if (!usarSupabase || !supabaseClient) return null;
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data || !data.session) return null;
        return data.session;
    } catch (e) {
        console.error('Erro ao verificar autenticação:', e.message);
        return null;
    }
}

// Usada pelas demais páginas administrativas: sem sessão, volta para index.html
// (é lá que o login acontece)
async function exigirAutenticacao() {
    const sessao = await obterSessaoAtual();
    if (!sessao) {
        window.location.href = 'index.html';
        return null;
    }
    return sessao;
}

async function fazerLogout() {
    if (usarSupabase && supabaseClient) {
        try { await supabaseClient.auth.signOut(); } catch (e) { console.warn('Erro ao sair:', e.message); }
    }
    window.location.href = 'index.html';
}

// ==================== SANITIZAÇÃO DE HTML ====================
// Usar sempre que um texto digitado por alguém (nome, atividade, comunicado,
// mensagem) for inserido via innerHTML, para evitar que tags/scripts digitados
// sejam executados no navegador de quem vir a tela.
function escapeHtml(texto) {
    if (texto === null || texto === undefined) return "";
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// ==================== SINCRONIZAÇÃO EM TEMPO REAL (SÓ PÁGINAS ADMINISTRATIVAS) ====================
// registro.html não chama isso — usa seu próprio mecanismo de verificação periódica.
function algumModalAberto() {
    var modais = document.querySelectorAll('[class*="modal"]');
    for (var i = 0; i < modais.length; i++) {
        var estilo = window.getComputedStyle(modais[i]);
        if (estilo.display === 'block' || estilo.display === 'flex') return true;
    }
    return false;
}

var _canalTempoReal = null;
function iniciarSincronizacaoTempoReal() {
    if (!usarSupabase || !supabaseClient) return;
    if (_canalTempoReal) return; // já iniciado nesta página

    async function atualizarTudo() {
        if (algumModalAberto()) return; // não interromper uma edição em andamento
        await carregarDados();
        if (typeof renderizarServidores === 'function') renderizarServidores();
        if (typeof renderizarAtividades === 'function') renderizarAtividades();
        if (typeof renderizarAtribuicoes === 'function') renderizarAtribuicoes();
        if (typeof renderizarListaServidoresAtribuicoes === 'function') renderizarListaServidoresAtribuicoes();
        if (typeof renderizarListaVisualizacao === 'function') renderizarListaVisualizacao();
        if (typeof atualizarListaFuncionariosPrincipal === 'function') atualizarListaFuncionariosPrincipal();
        if (typeof renderizarAcessoRapido === 'function') renderizarAcessoRapido();
        if (typeof atualizarSelects === 'function') atualizarSelects();
        if (typeof atualizarSelectVisualizacao === 'function') atualizarSelectVisualizacao();
        if (typeof atualizarEstatisticas === 'function') atualizarEstatisticas();
        if (typeof renderizarIndicadores === 'function') renderizarIndicadores();
    }

    _canalTempoReal = supabaseClient
        .channel('seate-sincronizacao')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'servidores' }, atualizarTudo)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'atividades' }, atualizarTudo)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'atribuicoes' }, atualizarTudo)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracao' }, atualizarTudo)
        .subscribe();
}

// ==================== ANO ATUAL (DINÂMICO) ====================
// Compartilhado por index.html e estatistica.html (eram cópias idênticas).
var ANO_ATUAL = String(new Date().getFullYear());
function getAnosDisponiveis() {
    var anos = [];
    for (var y = 2022; y <= parseInt(ANO_ATUAL); y++) { anos.push(String(y)); }
    return anos;
}

// ==================== TOTAIS DO ANO ATUAL (SUPABASE) ====================
var _totaisAnoAtualPromise = null;
function obterTotaisAnoAtual() {
    if (!_totaisAnoAtualPromise) { _totaisAnoAtualPromise = dbCarregarTotaisAno(ANO_ATUAL); }
    return _totaisAnoAtualPromise;
}

// ==================== CALCULAR TOTAL DO ANO ATUAL ====================
async function calcularTotalAnoAtual() {
    var totais = await obterTotaisAnoAtual();
    return totais.totalGeral;
}

// ==================== DADOS DE 2024 (EDITÁVEL NO SUPABASE) ====================
// 2022, 2023 e 2025 continuam fixos no código (dadosFixos/dadosPreenchidos).
// Só 2024 é lido/gravado no banco, permitindo edição mês a mês.
var _dados2024Promise = null;
function obterDados2024() {
    if (!_dados2024Promise) { _dados2024Promise = dbCarregarDados2024(); }
    return _dados2024Promise;
}
function invalidarCacheDados2024() {
    _dados2024Promise = null;
}

// Retorna {seateTotal, nahoraTotal} para qualquer ano do painel, decidindo a
// fonte certa: ano atual -> Supabase (registros); 2024 -> Supabase (editável);
// os demais -> dadosFixos (fixo no código, definido em cada página).
async function obterSeateNahoraPorAno(ano) {
    if (ano === ANO_ATUAL) {
        var t = await obterTotaisAnoAtual();
        return { seateTotal: t.seateTotal, nahoraTotal: t.nahoraTotal };
    }
    if (ano === "2024") {
        var dados2024 = await obterDados2024();
        var seateTotal = 0, nahoraTotal = 0;
        for (var ativ in dados2024.SEATE) { for (var m in dados2024.SEATE[ativ]) seateTotal += dados2024.SEATE[ativ][m] || 0; }
        for (var ativ in dados2024.NAHORA) { for (var m in dados2024.NAHORA[ativ]) nahoraTotal += dados2024.NAHORA[ativ][m] || 0; }
        return { seateTotal: seateTotal, nahoraTotal: nahoraTotal };
    }
    var dadosAno = (typeof dadosFixos !== 'undefined') ? dadosFixos[ano] : null;
    return dadosAno ? { seateTotal: dadosAno.seate, nahoraTotal: dadosAno.nahora } : { seateTotal: 0, nahoraTotal: 0 };
}

// ==================== DADOS GLOBAIS ====================
// Lista canônica de atividades (mesma usada em dados_iniciais.sql) — fonte única
// reaproveitada por outras páginas (ex: atividades.html, registro.html) em vez de
// cada uma manter sua própria cópia divergente.
const atividadesPadrao = [
    "ATEND TELEFONICO", "ATEND PRESENCIAL", "ATEND POR E-MAIL", "CAD PARTES E ADV NO PJE-E-PROC",
    "BAIXA ARQUIVOS E-PROC", "CERT DE MILITANCIA", "CERT DE OBJETO E PE", "CERT DE AUTOR",
    "CERT (PJe, Oracle, Civel, criminal, eleitoral)", "ANALISE PROCESSUAL", "DESARQUIVAMENTO DE PROCESSOS",
    "ENCAMINHAMENTO DE PROCESSOS A REPROGRAFIA", "ANALISE DEVOLUCAO DE CUSTAS",
    "ATEND REALIZADOS PELA LUCY (ASSISTENTE VIRTUAL)", "CONSULTA PROCESSUAL", "PESQUISA ORACLE-PROCESSUAL",
    "PROCESSOS FISICOS DIGITALIZADOS E MIGRADOS PARA O PJE",
    "CORRECOES DE PROCESSOS DIGITALIZADOS (desmembramento e correcoes)",
    "DIGITALIZACAO DE DOCUMENTOS PARA O PJDEF (11a, 18a E 19a VARAS)",
    "MIGRACAO PARA O PJE, RETIFICACAO E ENVIO AS VARAS DOS PROCESSOS DO JEF VIRTUAL",
    "MIGRACAO DE ARQUIVOS E-PROC P PJe", "DIGITALIZACAO DE PASTAS DE SERVIDORES DO ACERVO DO NUCGP",
    "REQUERIMENTO DE JUNTADA", "JUNTADA DE PETICOES", "DIGITALIZACAO DE PROCESSOS / PETICOES",
    "ATEND SEI", "ATEND TEAMS", "INFORMACOES GERAIS SOBRE CARTAS PRECATORIAS",
    "VALIDACAO DE CADASTRO DE PERITOS NO E-CPTEC", "MALOTE DIGITAL", "PROCESSOS SEI", "CONSULTA SEEU",
    "JUNTADA E ASSINATURA DE DOC PJE", "DEVOLUCAO DE PROCESSOS", "DIVISAO PASTAS SERVIDORES",
    "PASTA P SEI", "DESCARTE DE PROCESSOS INICIAIS E INCIDENTAIS", "PROTOCOLO PETICOES INICIAIS / INCIDENTAIS",
    "TERMO DE COMPARECIMENTO", "ATENDIMENTO TELEFONICO", "ATENDIMENTO PRESENCIAL",
    "PROTOCOLO PETICOES INICIAIS-INCIDENTAIS", "CADASTRO PARTES-ADV PJE", "CERTIDAO (Civel, criminal, eleitoral)",
    "CERTIDOES OBJETO E PE", "CERTIDOES DE MILITANCIA", "CERTIDOES DE AUTOR",
    "DIGITALIZACAO DE PROCESSOS-PETICOES", "ATENDIMENTO - EMAIL", "ANDAMENTO PROCESSUAL", "ATERMACAO",
    "CERTIDOES ORACLE-PJE", "RECEBIMENTO DE PROCESSOS-PETICOES", "INFORMACOES CADASTRO DE PARTES PJE E E-PROC",
    "INFORMACOES GERAIS"
];

let atividades = [];
let servidores = [];
let lotacoes = [];
let bloqueios = {};
let atribuicoes = {};
let mesConfigurado = new Date().getMonth();
let anoConfigurado = new Date().getFullYear();
let listaVisualizacao = [];
let dadosEstatisticos = {};

// Variáveis temporárias para modais
var edicaoServidorTemp = {index: null};
var edicaoAtividadeTemp = {servidor: null, atividadeAntiga: null};
var edicaoVisTemp = {servidor: null, atividadeAntiga: null, cardIndex: null};
var servidorAtualmenteSelecionado = null;
var anoEstatisticaSelecionado = null;

// ==================== FUNÇÃO PRINCIPAL: SALVAR SERVIDORES (COM SUPABASE) ====================
// ==================== EXCLUSÃO/RENOMEAÇÃO EXPLÍCITA DE SERVIDOR ====================
// salvarServidores() faz upsert por nome — nunca exclui nem detecta renomeação.
// Por isso, excluir e renomear precisam de uma ação explícita e direta no banco,
// chamada ANTES do sync geral (evita linha órfã ao renomear e linha nunca
// excluída ao remover um servidor).
async function excluirServidorDoBanco(nome) {
    if (!usarSupabase || !supabaseClient) return;
    try {
        const { error } = await supabaseClient.from(getTables().SERVIDORES).delete().eq('nome', nome);
        if (error) console.error('Erro ao excluir servidor "' + nome + '" no Supabase:', error.message);
    } catch (e) {
        console.error('❌ Erro em excluirServidorDoBanco:', e.message);
    }
}

async function renomearServidorNoBanco(nomeAntigo, nomeNovo, novaLotacao, bloqueado) {
    if (!usarSupabase || !supabaseClient) return;
    try {
        const { error } = await supabaseClient
            .from(getTables().SERVIDORES)
            .update({ nome: nomeNovo, lotacao: novaLotacao, bloqueado: bloqueado || false })
            .eq('nome', nomeAntigo);
        if (error) console.error('Erro ao renomear servidor "' + nomeAntigo + '" -> "' + nomeNovo + '" no Supabase:', error.message);
    } catch (e) {
        console.error('❌ Erro em renomearServidorNoBanco:', e.message);
    }
}

async function salvarServidores() {
    var TABLES = getTables();
    
    try {
        localStorage.setItem("seate_servidores", JSON.stringify(servidores));
        localStorage.setItem("seate_lotacoes", JSON.stringify(lotacoes));
        localStorage.setItem("seate_bloqueios", JSON.stringify(bloqueios));
        logDebug('✅ Servidores salvos no localStorage:', servidores.length);
        
        if (!usarSupabase || !supabaseClient) {
            console.warn('⚠️ Supabase não disponível. Dados salvos apenas no localStorage.');
            return;
        }
        
        logDebug('📤 Enviando servidores para o Supabase...');
        let sucessos = 0;
        let erros = 0;
        
        for (let i = 0; i < servidores.length; i++) {
            const nome = servidores[i];
            const lotacao = lotacoes[i] || 'SEATE';
            const bloqueado = bloqueios[nome] || false;
            
            try {
                const { error } = await supabaseClient
                    .from(TABLES.SERVIDORES)
                    .upsert({
                        nome: nome,
                        lotacao: lotacao,
                        bloqueado: bloqueado,
                        ordem: i
                    }, { onConflict: 'nome' });
                
                if (error) {
                    erros++;
                    console.error('❌ Erro ao salvar servidor "' + nome + '":', error.message);
                } else {
                    sucessos++;
                }
            } catch (e) {
                erros++;
                console.error('❌ Erro ao salvar servidor "' + nome + '":', e.message);
            }
        }
        
        logDebug('📊 Resumo: ' + sucessos + ' servidores salvos, ' + erros + ' erros.');
        
    } catch (e) {
        console.error('❌ Erro CRÍTICO ao sincronizar servidores:', e.message);
    }
}

// ==================== FUNÇÕES DE SALVAMENTO (WRAPPERS) ====================
async function salvarLotacoes() {
    try {
        localStorage.setItem("seate_lotacoes", JSON.stringify(lotacoes));
        await salvarServidores();
    } catch (e) {
        console.error('❌ Erro em salvarLotacoes:', e.message);
    }
}

async function salvarBloqueios() {
    try {
        localStorage.setItem("seate_bloqueios", JSON.stringify(bloqueios));
        await salvarServidores();
    } catch (e) {
        console.error('❌ Erro em salvarBloqueios:', e.message);
    }
}

async function salvarAtividades() {
    var TABLES = getTables();
    
    try {
        localStorage.setItem("seate_atividades", JSON.stringify(atividades));
        
        if (!usarSupabase || !supabaseClient) return;
        
        try {
            let sucessos = 0;
            for (let i = 0; i < atividades.length; i++) {
                const { error } = await supabaseClient
                    .from(TABLES.ATIVIDADES)
                    .upsert({
                        nome: atividades[i],
                        ordem: i
                    }, { onConflict: 'nome' });
                if (!error) sucessos++;
            }
            logDebug('✅ Atividades salvas no Supabase:', sucessos);
        } catch (e) {
            console.error('❌ Erro ao salvar atividades no Supabase:', e.message);
        }
    } catch (e) {
        console.error('❌ Erro em salvarAtividades:', e.message);
    }
}

async function salvarAtribuicoes() {
    var TABLES = getTables();
    
    try {
        localStorage.setItem("seate_atribuicoes", JSON.stringify(atribuicoes));
        
        if (!usarSupabase || !supabaseClient) return;
        
        try {
            // Resolver nome -> id (servidores e atividades)
            const { data: servData, error: servError } = await supabaseClient.from(TABLES.SERVIDORES).select('id, nome');
            const { data: ativData, error: ativError } = await supabaseClient.from(TABLES.ATIVIDADES).select('id, nome');
            if (servError || ativError) {
                console.error('salvarAtribuicoes lookup:', servError || ativError);
                return;
            }
            const idServidorPorNome = {};
            (servData || []).forEach(s => { idServidorPorNome[s.nome] = s.id; });
            const idAtividadePorNome = {};
            (ativData || []).forEach(a => { idAtividadePorNome[a.nome] = a.id; });
            
            // Buscar o estado atual no banco (por id)
            const { data: existentes, error: selectError } = await supabaseClient
                .from(TABLES.ATRIBUICOES)
                .select('servidor_id, atividade_id');
            
            if (selectError) {
                console.error('salvarAtribuicoes select:', selectError);
                return;
            }
            
            // Montar o conjunto desejado (estado atual em memória, já convertido para ids)
            const desejado = new Set();
            for (const atividade in atribuicoes) {
                const atividadeId = idAtividadePorNome[atividade];
                if (!atividadeId) continue; // atividade não existe mais na tabela — ignora
                for (const servidor of atribuicoes[atividade]) {
                    const servidorId = idServidorPorNome[servidor];
                    if (!servidorId) continue; // servidor não existe mais na tabela — ignora
                    desejado.add(servidorId + '\u241F' + atividadeId);
                }
            }
            const atual = new Set((existentes || []).map(r => r.servidor_id + '\u241F' + r.atividade_id));
            
            // Calcular apenas a diferença (o que entrou e o que saiu)
            const paraInserir = [];
            desejado.forEach(chave => {
                if (!atual.has(chave)) {
                    const [servidor_id, atividade_id] = chave.split('\u241F');
                    paraInserir.push({ servidor_id, atividade_id });
                }
            });
            const paraExcluir = [];
            atual.forEach(chave => {
                if (!desejado.has(chave)) {
                    const [servidor_id, atividade_id] = chave.split('\u241F');
                    paraExcluir.push({ servidor_id, atividade_id });
                }
            });
            
            if (paraInserir.length > 0) {
                const { error: insertError } = await supabaseClient.from(TABLES.ATRIBUICOES).insert(paraInserir);
                if (insertError) console.error('salvarAtribuicoes insert:', insertError);
            }
            
            if (paraExcluir.length > 0) {
                const resultados = await Promise.all(paraExcluir.map(p =>
                    supabaseClient.from(TABLES.ATRIBUICOES).delete().eq('servidor_id', p.servidor_id).eq('atividade_id', p.atividade_id)
                ));
                const falhas = resultados.filter(r => r.error);
                if (falhas.length > 0) console.error('salvarAtribuicoes delete: ' + falhas.length + ' falha(s)', falhas[0].error);
            }
            
            logDebug('✅ Atribuições sincronizadas no Supabase (+' + paraInserir.length + ' / -' + paraExcluir.length + ')');
        } catch (e) {
            console.error('❌ Erro ao salvar atribuições no Supabase:', e.message);
        }
    } catch (e) {
        console.error('❌ Erro em salvarAtribuicoes:', e.message);
    }
}

async function salvarTudo() {
    try {
        await salvarServidores();
        await salvarAtividades();
        await salvarAtribuicoes();
        salvarDadosEstatisticos();
        logDebug('🎉 Todos os dados foram salvos!');
    } catch (e) {
        console.error('❌ Erro em salvarTudo:', e.message);
    }
}

// ==================== FUNÇÕES DE CARREGAMENTO ====================
async function carregarDados() {
    var TABLES = getTables();
    
    try {
        if (!usarSupabase || !supabaseClient) {
            initSupabase();
        }
        
        if (usarSupabase && supabaseClient) {
            logDebug('📊 Buscando dados do Supabase...');
            
            try {
                const { data: servidoresData, error: servError } = await supabaseClient
                    .from(TABLES.SERVIDORES)
                    .select('*')
                    .order('ordem');
                
                if (!servError && servidoresData && servidoresData.length > 0) {
                    servidores = servidoresData.map(s => s.nome);
                    lotacoes = servidoresData.map(s => s.lotacao);
                    bloqueios = {};
                    for (const s of servidoresData) {
                        bloqueios[s.nome] = s.bloqueado || false;
                    }
                    logDebug('✅ Servidores carregados do Supabase:', servidores.length);
                } else {
                    console.warn('⚠️ Nenhum servidor no Supabase. Usando localStorage.');
                    carregarDadosLocal();
                    return;
                }
            } catch (e) {
                console.warn('⚠️ Erro ao carregar servidores:', e.message);
                carregarDadosLocal();
                return;
            }
            
            try {
                const { data: atividadesData, error: ativError } = await supabaseClient
                    .from(TABLES.ATIVIDADES)
                    .select('*')
                    .order('ordem');
                
                if (!ativError && atividadesData && atividadesData.length > 0) {
                    atividades = atividadesData.map(a => a.nome);
                    logDebug('✅ Atividades carregadas do Supabase:', atividades.length);
                } else {
                    console.warn('⚠️ Nenhuma atividade no Supabase. Usando localStorage.');
                    carregarDadosLocal();
                    return;
                }
            } catch (e) {
                console.warn('⚠️ Erro ao carregar atividades:', e.message);
                carregarDadosLocal();
                return;
            }
            
            try {
                const { data: atribData, error: atribError } = await supabaseClient
                    .from(TABLES.ATRIBUICOES)
                    .select('servidores(nome), atividades(nome)');
                
                if (!atribError && atribData) {
                    atribuicoes = {};
                    for (const item of atribData) {
                        const nomeAtividade = item.atividades ? item.atividades.nome : null;
                        const nomeServidor = item.servidores ? item.servidores.nome : null;
                        if (!nomeAtividade || !nomeServidor) continue;
                        if (!atribuicoes[nomeAtividade]) {
                            atribuicoes[nomeAtividade] = [];
                        }
                        atribuicoes[nomeAtividade].push(nomeServidor);
                    }
                    logDebug('✅ Atribuições carregadas do Supabase');
                }
            } catch (e) {
                console.warn('⚠️ Erro ao carregar atribuições:', e.message);
            }
            
            const storedMes = localStorage.getItem("seate_mes_config");
            const storedAno = localStorage.getItem("seate_ano_config");
            if (storedMes) mesConfigurado = parseInt(storedMes);
            if (storedAno) anoConfigurado = parseInt(storedAno);
            
            carregarDadosEstatisticos();
            logDebug('✅ Dados carregados do Supabase com sucesso!');
            
            if (typeof atualizarSelects === 'function') {
                atualizarSelects();
            }
            
            return;
        }
        
        logDebug('💾 Usando localStorage como fallback.');
        carregarDadosLocal();
        
        if (typeof atualizarSelects === 'function') {
            atualizarSelects();
        }
        
    } catch (e) {
        console.warn('❌ Erro ao carregar dados do Supabase:', e.message);
        console.warn('💾 Usando localStorage como fallback.');
        carregarDadosLocal();
        
        if (typeof atualizarSelects === 'function') {
            atualizarSelects();
        }
    }
}

function carregarDadosLocal() {
    try {
        const storedAtividades = localStorage.getItem("seate_atividades");
        atividades = storedAtividades ? JSON.parse(storedAtividades) : [...atividadesPadrao];
        if(!storedAtividades) localStorage.setItem("seate_atividades", JSON.stringify(atividades));
        
        const storedServidores = localStorage.getItem("seate_servidores");
        const storedLotacoes = localStorage.getItem("seate_lotacoes");
        if(storedServidores && storedLotacoes) {
            servidores = JSON.parse(storedServidores);
            lotacoes = JSON.parse(storedLotacoes);
        } else {
            servidores = [];
            lotacoes = [];
            localStorage.setItem("seate_servidores", JSON.stringify(servidores));
            localStorage.setItem("seate_lotacoes", JSON.stringify(lotacoes));
        }
        
        const storedBloqueios = localStorage.getItem("seate_bloqueios");
        bloqueios = storedBloqueios ? JSON.parse(storedBloqueios) : {};
        if(!storedBloqueios) localStorage.setItem("seate_bloqueios", JSON.stringify(bloqueios));
        
        const storedAtribuicoes = localStorage.getItem("seate_atribuicoes");
        atribuicoes = storedAtribuicoes ? JSON.parse(storedAtribuicoes) : {};
        if(!storedAtribuicoes) localStorage.setItem("seate_atribuicoes", JSON.stringify(atribuicoes));
        
        const storedMes = localStorage.getItem("seate_mes_config");
        const storedAno = localStorage.getItem("seate_ano_config");
        if(storedMes) mesConfigurado = parseInt(storedMes);
        if(storedAno) anoConfigurado = parseInt(storedAno);
        
        carregarDadosEstatisticos();
        logDebug('✅ Dados carregados do localStorage');
    } catch (e) {
        console.warn('Erro ao carregar dados:', e.message);
    }
}

// ==================== FUNÇÕES DE PERSISTÊNCIA (ESTATÍSTICAS) ====================
function salvarDadosEstatisticos() {
    try {
        localStorage.setItem("seate_dados_estatisticos", JSON.stringify(dadosEstatisticos));
    } catch (e) {
        console.warn('Erro ao salvar dados estatísticos:', e.message);
    }
}

function carregarDadosEstatisticos() {
    try {
        var stored = localStorage.getItem("seate_dados_estatisticos");
        if (stored) {
            dadosEstatisticos = JSON.parse(stored);
        } else {
            dadosEstatisticos = {};
            var anos = ["2022", "2023", "2024", "2025"];
            for (var i = 0; i < anos.length; i++) {
                dadosEstatisticos[anos[i]] = {};
            }
            salvarDadosEstatisticos();
        }
    } catch(e) {
        console.warn('Erro ao carregar dados estatísticos:', e.message);
        dadosEstatisticos = {};
        var anos = ["2022", "2023", "2024", "2025"];
        for (var i = 0; i < anos.length; i++) {
            dadosEstatisticos[anos[i]] = {};
        }
        salvarDadosEstatisticos();
    }
}

function getDadosEstatisticosAno(ano) {
    try {
        if (!dadosEstatisticos[ano]) {
            dadosEstatisticos[ano] = {};
            salvarDadosEstatisticos();
        }
        return dadosEstatisticos[ano];
    } catch(e) {
        console.warn('Erro em getDadosEstatisticosAno:', e.message);
        return {};
    }
}

// ==================== FUNÇÃO getDadosAtividadeAno ====================
function getDadosAtividadeAno(ano, atividade) {
    try {
        if (!dadosEstatisticos[ano]) {
            dadosEstatisticos[ano] = {};
        }
        if (!dadosEstatisticos[ano][atividade]) {
            dadosEstatisticos[ano][atividade] = {
                "Janeiro": 0, "Fevereiro": 0, "Marco": 0, "Abril": 0,
                "Maio": 0, "Junho": 0, "Julho": 0, "Agosto": 0,
                "Setembro": 0, "Outubro": 0, "Novembro": 0, "Dezembro": 0,
                "Total": 0
            };
            salvarDadosEstatisticos();
        }
        return dadosEstatisticos[ano][atividade];
    } catch(e) {
        console.warn('Erro em getDadosAtividadeAno:', e.message);
        return { "Total": 0 };
    }
}

// ==================== FUNÇÃO recalcularTotalLinha ====================
function recalcularTotalLinha(input) {
    try {
        var atividade = input.getAttribute('data-atividade');
        var ano = anoEstatisticaSelecionado || "2024";
        var dadosAtiv = getDadosAtividadeAno(ano, atividade);
        var meses = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        
        var inputs = document.querySelectorAll('.input-mes-estatistica');
        var total = 0;
        for (var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            if (inp.getAttribute('data-atividade') === atividade) {
                var mes = inp.getAttribute('data-mes');
                var valor = parseInt(inp.value) || 0;
                dadosAtiv[mes] = valor;
                total += valor;
            }
        }
        
        dadosAtiv["Total"] = total;
        
        var rows = document.querySelectorAll('#listaAtividadesEstatistica tbody tr');
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var nomeAtiv = row.querySelector('td:first-child')?.innerText;
            if (nomeAtiv === atividade) {
                var totalCell = row.querySelector('td:last-child');
                if (totalCell) {
                    totalCell.innerText = total;
                }
                break;
            }
        }
        return total;
    } catch(e) {
        console.warn('Erro ao recalcular total:', e.message);
        return 0;
    }
}

function calcularTotalAtividade(dados) {
    try {
        var meses = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        var total = 0;
        for (var i = 0; i < meses.length; i++) {
            total += dados[meses[i]] || 0;
        }
        dados["Total"] = total;
        return total;
    } catch(e) {
        console.warn('Erro em calcularTotalAtividade:', e.message);
        return 0;
    }
}

async function salvarConfigMes() {
    try {
        mesConfigurado = parseInt(document.getElementById("configMes").value);
        anoConfigurado = parseInt(document.getElementById("configAno").value);
        localStorage.setItem("seate_mes_config", mesConfigurado);
        localStorage.setItem("seate_ano_config", anoConfigurado);
        atualizarDisplayMes();
        if(typeof atualizarListaFuncionariosPrincipal === 'function') atualizarListaFuncionariosPrincipal();
        if(typeof renderizarAcessoRapido === 'function') renderizarAcessoRapido();
        feedback("Configuração salva!");
        if (supabaseDisponivel) {
            try { await dbSalvarConfiguracao(mesConfigurado, anoConfigurado); }
            catch(e) { console.warn('Erro ao sincronizar configuração do mês com o Supabase:', e.message); }
        }
    } catch(e) {
        console.warn('Erro ao salvar configuração do mês:', e.message);
        feedback("Erro ao salvar configuração!");
    }
}

// ==================== CARREGAR PERÍODO CONFIGURADO DE VERDADE (SUPABASE) ====================
// Antes, mesConfigurado/anoConfigurado só existiam no localStorage de cada
// navegador — cada servidor/computador podia "achar" que o período era um
// mês diferente. Esta função busca o valor real, compartilhado, salvo na
// tabela "configuracao", e mantém o localStorage como reserva (offline).
async function carregarConfiguracaoReal() {
    if (!supabaseDisponivel) return;
    try {
        var config = await dbCarregarConfiguracao();
        if (config && typeof config.mes === 'number' && typeof config.ano === 'number') {
            mesConfigurado = config.mes;
            anoConfigurado = config.ano;
            localStorage.setItem("seate_mes_config", mesConfigurado);
            localStorage.setItem("seate_ano_config", anoConfigurado);
        }
    } catch(e) {
        console.warn('Erro ao carregar configuração real do mês:', e.message);
    }
}

// ==================== FUNÇÕES AUXILIARES ====================
function getStatusServidor(nome) { 
    try {
        return bloqueios[nome] === true ? "bloqueado" : "liberado"; 
    } catch(e) { return "liberado"; }
}

function getLotacaoServidor(nome) { 
    try {
        var idx = servidores.indexOf(nome); 
        return idx !== -1 ? lotacoes[idx] : "SEATE"; 
    } catch(e) { return "SEATE"; }
}

function gerarLink(nome) {
    try {
        var nomeUrl = encodeURIComponent(nome);
        var caminhoAtual = window.location.pathname;
        var partes = caminhoAtual.split('/');
        partes[partes.length - 1] = 'registro.html';
        var novoCaminho = partes.join('/');
        return window.location.origin + novoCaminho + "?user=" + nomeUrl;
    } catch(e) {
        return "registro.html";
    }
}

function copiarLink(nome) { 
    try {
        navigator.clipboard.writeText(gerarLink(nome)).then(function() {
            feedback("Link copiado!");
        }).catch(function() {
            feedback("Erro!");
        });
    } catch(e) {
        feedback("Erro ao copiar link");
    }
}

function acessarRegistro(nome) { 
    try {
        window.open(gerarLink(nome), "_blank"); 
    } catch(e) {
        feedback("Erro ao abrir registro");
    }
}

function toggleBloqueio(nome) { 
    try {
        bloqueios[nome] = !bloqueios[nome]; 
        salvarServidores();
        if(typeof renderizarServidores === 'function') renderizarServidores(); 
        if(typeof atualizarListaFuncionariosPrincipal === 'function') atualizarListaFuncionariosPrincipal(); 
        feedback("Status alterado!"); 
    } catch(e) {
        console.warn('Erro ao alternar bloqueio:', e.message);
        feedback("Erro ao alterar status!");
    }
}

function verificarPreenchimento(nome) {
    try {
        var chave = "seate_v5_" + nome;
        var registros = localStorage.getItem(chave);
        if(!registros) return false;
        var dados = JSON.parse(registros);
        var mesStr = String(mesConfigurado + 1).padStart(2,"0");
        var anoMesBusca = anoConfigurado + "-" + mesStr;
        for(var data in dados) {
            if(data.startsWith(anoMesBusca) && dados[data]?.atividades && Object.keys(dados[data].atividades).length > 0) {
                return true;
            }
        }
        return false;
    } catch(e) {
        return false;
    }
}

function feedback(msg) { 
    try {
        var fb = document.createElement("div"); 
        fb.innerText = msg; 
        fb.style.cssText = "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#1F4E79;color:white;padding:10px 20px;border-radius:40px;z-index:2000;"; 
        document.body.appendChild(fb); 
        setTimeout(function() { 
            try { fb.remove(); } catch(e) {} 
        }, 2500); 
    } catch(e) {}
}

// ==================== FUNÇÕES DE DISPLAY ====================
function atualizarDisplayMes() {
    try {
        const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        var displayElement = document.getElementById("mesConfiguradoDisplay");
        var configMesElement = document.getElementById("configMes");
        var configAnoElement = document.getElementById("configAno");
        if(displayElement) displayElement.innerHTML = `Mês atual: ${meses[mesConfigurado]}/${anoConfigurado}`;
        if(configMesElement) configMesElement.value = mesConfigurado;
        if(configAnoElement) configAnoElement.value = anoConfigurado;
    } catch(e) {
        console.warn('Erro ao atualizar display do mês:', e.message);
    }
}

// ==================== FUNÇÕES DE MODAIS ====================
function fecharModalEdicaoServidor() { 
    try { document.getElementById("modalEdicaoServidor").style.display = "none"; } catch(e) {} 
}

function fecharModalEdicao() { 
    try { document.getElementById("modalEdicaoAtividade").style.display = "none"; } catch(e) {} 
}

function fecharModalEdicaoVisualizacao() { 
    try { document.getElementById("modalEdicaoVisualizacao").style.display = "none"; } catch(e) {} 
}

function fecharModalEstatistica() {
    try { document.getElementById("modalEstatistica").style.display = "none"; } catch(e) {}
}

// ==================== FUNÇÕES DE ATUALIZAÇÃO DE SELECTS ====================
function atualizarSelects() {
    try {
        var selAtiv = document.getElementById("selectAtividadeAtribuir"); 
        if(selAtiv) { 
            var html = '<option value="">Selecione</option>'; 
            for(var i=0; i<atividades.length; i++) {
                html += `<option value="${escapeHtml(atividades[i])}">${escapeHtml(atividades[i])}</option>`; 
            }
            selAtiv.innerHTML = html; 
        }
        
        var selServ = document.getElementById("selectServidorAtribuir"); 
        if(selServ) { 
            var html = '<option value="">Selecione</option>'; 
            for(var i=0; i<servidores.length; i++) {
                html += `<option value="${escapeHtml(servidores[i])}">${escapeHtml(servidores[i])} (${escapeHtml(lotacoes[i])})</option>`;
            }
            selServ.innerHTML = html; 
        }
        
        var modalSel = document.getElementById("modalNovaAtividade"); 
        if(modalSel) { 
            var html = ''; 
            for(var i=0; i<atividades.length; i++) {
                html += `<option value="${escapeHtml(atividades[i])}">${escapeHtml(atividades[i])}</option>`;
            }
            modalSel.innerHTML = html; 
        }
        
        var modalVisSel = document.getElementById("modalVisNovaAtividade");
        if(modalVisSel) { 
            var html = ''; 
            for(var i=0; i<atividades.length; i++) {
                html += `<option value="${escapeHtml(atividades[i])}">${escapeHtml(atividades[i])}</option>`;
            }
            modalVisSel.innerHTML = html; 
        }
        
        var selectsRapidos = document.querySelectorAll('.atribuicao-rapida-container select');
        if(selectsRapidos.length > 0) {
            var storedBloqueios = localStorage.getItem("seate_bloqueios");
            var bloqueios = storedBloqueios ? JSON.parse(storedBloqueios) : {};
            
            for(var s = 0; s < selectsRapidos.length; s++) {
                var select = selectsRapidos[s];
                var currentVal = select.value;
                var html = '<option value="">Selecione</option>';
                for(var j = 0; j < servidores.length; j++) {
                    var servNome = servidores[j];
                    var estaBloqueado = bloqueios[servNome] === true;
                    var lotacao = lotacoes[j] || "SEATE";
                    var label = escapeHtml(servNome) + " (" + escapeHtml(lotacao) + ")";
                    if(estaBloqueado) {
                        label += " 🔒";
                    }
                    html += '<option value="' + escapeHtml(servNome) + '"' + (estaBloqueado ? ' style="color:#999;font-style:italic;"' : '') + '>' + label + '</option>';
                }
                select.innerHTML = html;
                if(currentVal && servidores.indexOf(currentVal) !== -1) {
                    select.value = currentVal;
                }
            }
        }
        
    } catch(e) {
        console.warn('Erro ao atualizar selects:', e.message);
    }
}

function atualizarSelectVisualizacao() { 
    try {
        var sel = document.getElementById("selectServidorVisualizar"); 
        if(sel) { 
            var html = '<option value="">Selecione...</option>'; 
            for(var i=0; i<servidores.length; i++) {
                html += `<option value="${escapeHtml(servidores[i])}">${escapeHtml(servidores[i])} (${escapeHtml(lotacoes[i])})</option>`;
            }
            sel.innerHTML = html; 
        } 
    } catch(e) {
        console.warn('Erro ao atualizar select visualização:', e.message);
    }
}

// ==================== FUNÇÕES DE ATRIBUIÇÕES ====================
function atualizarQuadroAtividadesServidor() { 
    try {
        var serv = document.getElementById("selectServidorAtribuir").value; 
        var div = document.getElementById("listaAtividadesExistentes"); 
        if(!serv) { 
            if(div) div.innerHTML = '<span class="sem-atividades">Selecione um servidor</span>'; 
            return; 
        } 
        var ativs = []; 
        for(var a in atribuicoes) {
            if(atribuicoes[a].indexOf(serv) !== -1) ativs.push(a); 
        }
        if(ativs.length === 0) { 
            if(div) div.innerHTML = '<span class="sem-atividades">Nenhuma atividade</span>'; 
        } else { 
            var html = ""; 
            for(var i=0; i<ativs.length; i++) {
                html += `<span class="preview-badge">${escapeHtml(ativs[i])}</span>`;
            }
            if(div) div.innerHTML = html; 
        } 
    } catch(e) {
        console.warn('Erro ao atualizar quadro de atividades:', e.message);
    }
}

function renderizarListaServidoresAtribuicoes() { 
    try {
        var container = document.getElementById("listaServidoresAtribuicoes"); 
        if(!container) return; 
        var search = document.getElementById("searchServidorAtribuicoes")?.value.toLowerCase() || ""; 
        var filtrados = []; 
        for(var i=0; i<servidores.length; i++) {
            if(servidores[i].toLowerCase().indexOf(search) !== -1) filtrados.push(servidores[i]); 
        }
        if(filtrados.length === 0) { 
            container.innerHTML = '<div style="padding:20px;text-align:center;color:#888;">Nenhum encontrado</div>'; 
            return; 
        } 
        var html = ""; 
        for(var i=0; i<filtrados.length; i++) { 
            var nome = filtrados[i];
            var lot = getLotacaoServidor(nome);
            var qtd = 0; 
            for(var a in atribuicoes) {
                if(atribuicoes[a].indexOf(nome) !== -1) qtd++; 
            }
            var ativo = (servidorAtualmenteSelecionado === nome) ? 'ativo' : '';
            html += `<div class="item-servidor ${ativo}" onclick="selecionarServidorAtribuicoes('${nome.replace(/'/g,"\\'")}')">`;
            html += `<div class="servidor-info"><span class="servidor-nome">${escapeHtml(nome)}</span><span class="servidor-lotacao">Lotação: ${escapeHtml(lot)}</span></div>`;
            html += `<span class="servidor-qtd">${qtd} atividades</span>`;
            html += `</div>`; 
        } 
        container.innerHTML = html; 
    } catch(e) {
        console.warn('Erro ao renderizar lista de servidores:', e.message);
    }
}

function selecionarServidorAtribuicoes(nome) { 
    try {
        servidorAtualmenteSelecionado = nome; 
        renderizarListaServidoresAtribuicoes(); 
        var ativs = []; 
        for(var a in atribuicoes) {
            if(atribuicoes[a].indexOf(nome) !== -1) ativs.push(a); 
        }
        var tituloElement = document.getElementById("tituloServidorSelecionado");
        var listaElement = document.getElementById("listaAtividadesServidorSelecionado");
        if(tituloElement) tituloElement.innerHTML = `Atividades de ${escapeHtml(nome)} (Lotação: ${escapeHtml(getLotacaoServidor(nome))})`; 
        if(!listaElement) return;
        if(ativs.length === 0) {
            listaElement.innerHTML = '<span class="sem-atividades">Nenhuma atividade</span>'; 
        } else { 
            var html = ""; 
            for(var i=0; i<ativs.length; i++) { 
                html += `<div class="item-atividade-com-acoes"><span class="item-atividade-nome">${escapeHtml(ativs[i])}</span><div class="item-atividade-acoes"><button class="btn-acao-pequeno" onclick="abrirModalEdicao('${nome.replace(/'/g,"\\'")}','${ativs[i].replace(/'/g,"\\'")}')">Editar</button><button class="btn-excluir-pequeno" onclick="excluirAtividadeDoServidor('${nome.replace(/'/g,"\\'")}','${ativs[i].replace(/'/g,"\\'")}')">Excluir</button></div></div>`; 
            }
            listaElement.innerHTML = html; 
        } 
    } catch(e) {
        console.warn('Erro ao selecionar servidor:', e.message);
    }
}

function excluirAtividadeDoServidor(serv, ativ) { 
    try {
        if(confirm(`Excluir "${ativ}" de ${serv}?`)) { 
            var lista = atribuicoes[ativ] || []; 
            atribuicoes[ativ] = lista.filter(function(s) { return s !== serv; }); 
            if(atribuicoes[ativ].length === 0) delete atribuicoes[ativ]; 
            salvarAtribuicoes(); 
            feedback("Removida!"); 
            renderizarListaServidoresAtribuicoes(); 
            if(servidorAtualmenteSelecionado === serv) selecionarServidorAtribuicoes(serv); 
            if(typeof renderizarAtribuicoes === 'function') renderizarAtribuicoes(); 
            if(typeof atualizarEstatisticas === 'function') atualizarEstatisticas(); 
            if(typeof renderizarListaVisualizacao === 'function') renderizarListaVisualizacao(); 
            if(typeof atualizarListaFuncionariosPrincipal === 'function') atualizarListaFuncionariosPrincipal(); 
        } 
    } catch(e) {
        console.warn('Erro ao excluir atividade do servidor:', e.message);
        feedback("Erro ao excluir atividade!");
    }
}

function renderizarAtribuicoes() { 
    try {
        var tbody = document.getElementById("corpoAtribuicoes"); 
        if(!tbody) return; 
        var entries = []; 
        for(var a in atribuicoes) {
            entries.push({atividade:a, servidores:atribuicoes[a]}); 
        }
        if(entries.length === 0) { 
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Nenhuma atribuição</td></tr>'; 
            return; 
        } 
        var html = ""; 
        for(var i=0; i<entries.length; i++) { 
            var servsHtml = ""; 
            for(var j=0; j<entries[i].servidores.length; j++) {
                servsHtml += `<span class="funcionario-tag">${escapeHtml(entries[i].servidores[j])}<span class="lotacao-tag">${escapeHtml(getLotacaoServidor(entries[i].servidores[j]))}</span></span>`;
            }
            html += `<tr><td><span class="badge-atividade badge">${escapeHtml(entries[i].atividade)}</span></td><td>${servsHtml}</td><td class="acoes-cell"><button class="btn-excluir-circular" onclick="removerAtribuicao('${entries[i].atividade.replace(/'/g,"\\'")}')">Excluir</button></td></tr>`; 
        } 
        tbody.innerHTML = html; 
    } catch(e) {
        console.warn('Erro ao renderizar atribuições:', e.message);
    }
}

function removerAtribuicao(ativ) { 
    try {
        if(confirm(`Remover todas as atribuições de "${ativ}"?`)) { 
            delete atribuicoes[ativ]; 
            salvarAtribuicoes(); 
            renderizarListaServidoresAtribuicoes(); 
            renderizarAtribuicoes(); 
            if(servidorAtualmenteSelecionado) selecionarServidorAtribuicoes(servidorAtualmenteSelecionado); 
            if(typeof atualizarEstatisticas === 'function') atualizarEstatisticas(); 
            if(typeof renderizarListaVisualizacao === 'function') renderizarListaVisualizacao(); 
            if(typeof atualizarListaFuncionariosPrincipal === 'function') atualizarListaFuncionariosPrincipal(); 
            feedback("Removidas!"); 
        } 
    } catch(e) {
        console.warn('Erro ao remover atribuição:', e.message);
        feedback("Erro ao remover atribuição!");
    }
}

// ==================== FUNÇÕES DE MODAIS DE EDIÇÃO ====================
function abrirModalEdicao(serv, ativ) { 
    try {
        edicaoAtividadeTemp = {servidor: serv, atividadeAntiga: ativ}; 
        document.getElementById("modalServidorNome").value = serv; 
        document.getElementById("modalAtividadeAtual").value = ativ; 
        var sel = document.getElementById("modalNovaAtividade"); 
        var html = ''; 
        for(var i=0; i<atividades.length; i++) {
            if(atividades[i] !== ativ) html += `<option value="${escapeHtml(atividades[i])}">${escapeHtml(atividades[i])}</option>`;
        }
        sel.innerHTML = html; 
        document.getElementById("modalEdicaoAtividade").style.display = "block"; 
    } catch(e) {
        console.warn('Erro ao abrir modal de edição:', e.message);
    }
}

function confirmarEdicaoAtividade() { 
    try {
        var nova = document.getElementById("modalNovaAtividade").value; 
        if(!nova) { feedback("Selecione nova atividade!"); return; } 
        var serv = edicaoAtividadeTemp.servidor;
        var antiga = edicaoAtividadeTemp.atividadeAntiga; 
        var listaAntiga = atribuicoes[antiga] || []; 
        atribuicoes[antiga] = listaAntiga.filter(function(s) { return s !== serv; }); 
        if(atribuicoes[antiga].length === 0) delete atribuicoes[antiga]; 
        var listaNova = atribuicoes[nova] || []; 
        if(listaNova.indexOf(serv) === -1) {
            listaNova.push(serv); 
        } else { 
            feedback("Já possui esta atividade!"); 
            fecharModalEdicao(); 
            return; 
        } 
        atribuicoes[nova] = listaNova; 
        salvarAtribuicoes(); 
        feedback("Atividade alterada!"); 
        fecharModalEdicao(); 
        renderizarListaServidoresAtribuicoes(); 
        if(servidorAtualmenteSelecionado === serv) selecionarServidorAtribuicoes(serv); 
        if(typeof renderizarAtribuicoes === 'function') renderizarAtribuicoes(); 
        if(typeof atualizarEstatisticas === 'function') atualizarEstatisticas(); 
        if(typeof renderizarListaVisualizacao === 'function') renderizarListaVisualizacao(); 
        if(typeof atualizarListaFuncionariosPrincipal === 'function') atualizarListaFuncionariosPrincipal(); 
    } catch(e) {
        console.warn('Erro ao confirmar edição de atividade:', e.message);
        feedback("Erro ao editar atividade!");
    }
}

function abrirModalEdicaoVisualizacao(serv, ativ, idx) { 
    try {
        edicaoVisTemp = {servidor: serv, atividadeAntiga: ativ, cardIndex: idx}; 
        document.getElementById("modalVisServidorNome").value = serv; 
        document.getElementById("modalVisAtividadeAtual").value = ativ; 
        var sel = document.getElementById("modalVisNovaAtividade"); 
        var html = ''; 
        for(var i=0; i<atividades.length; i++) {
            if(atividades[i] !== ativ) html += `<option value="${escapeHtml(atividades[i])}">${escapeHtml(atividades[i])}</option>`;
        }
        sel.innerHTML = html; 
        document.getElementById("modalEdicaoVisualizacao").style.display = "block"; 
    } catch(e) {
        console.warn('Erro ao abrir modal de edição visualização:', e.message);
    }
}

function confirmarEdicaoAtividadeVisualizacao() { 
    try {
        var nova = document.getElementById("modalVisNovaAtividade").value; 
        if(!nova) { feedback("Selecione nova atividade!"); return; } 
        var serv = edicaoVisTemp.servidor;
        var antiga = edicaoVisTemp.atividadeAntiga; 
        var listaAntiga = atribuicoes[antiga] || []; 
        atribuicoes[antiga] = listaAntiga.filter(function(s) { return s !== serv; }); 
        if(atribuicoes[antiga].length === 0) delete atribuicoes[antiga]; 
        var listaNova = atribuicoes[nova] || []; 
        if(listaNova.indexOf(serv) === -1) {
            listaNova.push(serv); 
        } else { 
            feedback("Já possui esta atividade!"); 
            fecharModalEdicaoVisualizacao(); 
            return; 
        } 
        atribuicoes[nova] = listaNova; 
        salvarAtribuicoes(); 
        feedback("Atividade alterada!"); 
        fecharModalEdicaoVisualizacao(); 
        renderizarListaServidoresAtribuicoes(); 
        if(typeof renderizarAtribuicoes === 'function') renderizarAtribuicoes(); 
        if(typeof atualizarEstatisticas === 'function') atualizarEstatisticas(); 
        if(typeof renderizarListaVisualizacao === 'function') renderizarListaVisualizacao(); 
        if(typeof atualizarListaFuncionariosPrincipal === 'function') atualizarListaFuncionariosPrincipal(); 
    } catch(e) {
        console.warn('Erro ao confirmar edição de atividade visualização:', e.message);
        feedback("Erro ao editar atividade!");
    }
}

// ==================== FUNÇÕES DE NAVEGAÇÃO ====================
function configurarNavegacao() {
    try {
        var tabs = document.querySelectorAll('.tab-link');
        if(!tabs || tabs.length === 0) {
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

        for(var i = 0; i < tabs.length; i++) {
            tabs[i].onclick = function(e) {
                try {
                    e.preventDefault();
                    var id = this.getAttribute('data-tab');
                    if(paginas[id]) {
                        window.location.href = paginas[id];
                    } else {
                        var texto = this.textContent.trim();
                        if (texto.indexOf('Adicionar') !== -1) window.location.href = 'atividades.html';
                        else if (texto.indexOf('Atribuir') !== -1) window.location.href = 'atribuicoes.html';
                        else if (texto.indexOf('Servidores') !== -1) window.location.href = 'servidores.html';
                        else if (texto.indexOf('Principal') !== -1) window.location.href = 'index.html';
                        else if (texto.indexOf('Distribuição') !== -1) window.location.href = 'visualizar.html';
                        else if (texto.indexOf('Estatística') !== -1) window.location.href = 'estatistica.html';
                    }
                } catch(err) {
                    console.warn('Erro ao navegar:', err.message);
                }
            };
        }
    } catch(e) {
        console.warn('Erro ao configurar navegação:', e.message);
    }
}

// ==================== FUNÇÃO PARA ABRIR MODAL ESTATÍSTICA ====================
function abrirModalEstatistica(ano) {
    try {
        anoEstatisticaSelecionado = ano;
        var tituloElement = document.getElementById("anoEstatisticaTitulo");
        if (tituloElement) tituloElement.innerText = ano;
        
        var container = document.getElementById("listaAtividadesEstatistica");
        if (!container) {
            console.warn('Container listaAtividadesEstatistica não encontrado');
            return;
        }
        
        var html = '';
        html += '<div class="tabela-estatistica-container">';
        html += '<table class="tabela-estatistica">';
        html += '<thead><tr>';
        html += '<th style="text-align:left; min-width:180px;">Atividade</th>';
        html += '<th>Jan</th><th>Fev</th><th>Mar</th><th>Abr</th><th>Mai</th><th>Jun</th>';
        html += '<th>Jul</th><th>Ago</th><th>Set</th><th>Out</th><th>Nov</th><th>Dez</th>';
        html += '<th style="background:var(--destaque); color:var(--azul-marinho);">TOTAL</th>';
        html += '</tr></thead><tbody>';
        
        var meses = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        
        for(var i = 0; i < atividades.length; i++) {
            var ativ = atividades[i];
            var dadosAtiv = getDadosAtividadeAno(ano, ativ);
            
            html += '<tr>';
            html += `<td style="text-align:left; font-weight:500; color:var(--azul-marinho);">${escapeHtml(ativ)}</td>`;
            
            for(var j = 0; j < meses.length; j++) {
                var valor = dadosAtiv[meses[j]] || 0;
                html += `<td><input type="number" class="input-mes-estatistica" data-atividade="${escapeHtml(ativ)}" data-mes="${meses[j]}" value="${valor}" min="0" style="width:55px; padding:4px 2px; text-align:center; border:1px solid var(--cinza-borda); border-radius:6px; font-size:0.75rem;"></td>`;
            }
            
            var total = dadosAtiv["Total"] || 0;
            html += `<td style="text-align:center; font-weight:700; color:var(--azul-institucional); background:var(--cinza-suave);">${total}</td>`;
            html += '</tr>';
        }
        
        html += '</tbody></table>';
        html += '</div>';
        
        html += '<div style="margin-top:12px; text-align:right; font-size:0.8rem; color:#888;">';
        html += '💡 Os totais são calculados automaticamente ao salvar.';
        html += '</div>';
        
        container.innerHTML = html;
        
        var inputs = document.querySelectorAll('.input-mes-estatistica');
        for(var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('input', function() {
                recalcularTotalLinha(this);
            });
        }
        
        var modal = document.getElementById("modalEstatistica");
        if (modal) modal.style.display = "block";
        
    } catch(e) {
        console.warn('Erro ao abrir modal estatística:', e.message);
        feedback("Erro ao abrir modal!");
    }
}

function salvarDadosEstatisticaModal() {
    try {
        var inputs = document.querySelectorAll('.input-mes-estatistica');
        var meses = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        var ano = anoEstatisticaSelecionado;
        
        if (!ano) {
            feedback("Selecione um ano primeiro!");
            return;
        }
        
        for(var i = 0; i < inputs.length; i++) {
            var inp = inputs[i];
            var atividade = inp.getAttribute('data-atividade');
            var mes = inp.getAttribute('data-mes');
            var valor = parseInt(inp.value) || 0;
            
            var dadosAtiv = getDadosAtividadeAno(ano, atividade);
            dadosAtiv[mes] = valor;
        }
        
        for(var i = 0; i < atividades.length; i++) {
            var ativ = atividades[i];
            var dadosAtiv = getDadosAtividadeAno(ano, ativ);
            calcularTotalAtividade(dadosAtiv);
        }
        
        salvarDadosEstatisticos();
        feedback("Dados salvos com sucesso!");
        fecharModalEstatistica();
        
        if(typeof atualizarEstatisticas === 'function') {
            atualizarEstatisticas();
        }
        
    } catch(e) {
        console.warn('Erro ao salvar dados estatísticos:', e.message);
        feedback("Erro ao salvar dados!");
    }
}

// ============================================================
// FUNÇÃO: ABRIR MODAL DE ANÁLISE POR ATIVIDADE
// ============================================================
function abrirModalAnaliseAtividade(ano) {
    try {
        var modalExistente = document.getElementById("modalAnaliseAtividade");
        if (!modalExistente) {
            criarModalAnaliseAtividade();
        }
        
        var tituloElement = document.getElementById("modalAnaliseTitulo");
        var container = document.getElementById("listaAnaliseAtividades");
        
        if (tituloElement) {
            tituloElement.innerText = "📊 Análise Detalhada por Atividade - " + ano;
        }
        
        if (!container) {
            console.warn('Container listaAnaliseAtividades não encontrado');
            return;
        }
        
        var html = '';
        var totalSeate = 0;
        var totalNahora = 0;
        
        if (ano === "2026") {
            var seateTotais = {};
            var nahoraTotais = {};
            var temRegistros = false;
            
            for (var i = 0; i < servidores.length; i++) {
                var nome = servidores[i];
                var lotacao = getLotacaoServidor(nome);
                var chave = "seate_v5_" + nome;
                var registros = localStorage.getItem(chave);
                
                if (registros) {
                    try {
                        var dados = JSON.parse(registros);
                        for (var data in dados) {
                            if (data.startsWith("2026-") && dados[data]?.atividades) {
                                temRegistros = true;
                                var atividadesDia = dados[data].atividades;
                                for (var ativ in atividadesDia) {
                                    var valor = atividadesDia[ativ] || 0;
                                    if (lotacao === "SEATE") {
                                        seateTotais[ativ] = (seateTotais[ativ] || 0) + valor;
                                    } else if (lotacao === "NAHORA") {
                                        nahoraTotais[ativ] = (nahoraTotais[ativ] || 0) + valor;
                                    }
                                }
                            }
                        }
                    } catch(e) {}
                }
            }
            
            if (!temRegistros) {
                container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Nenhum registro encontrado para 2026</p>';
                document.getElementById("modalAnaliseAtividade").style.display = "block";
                return;
            }
            
            for (var ativ in seateTotais) {
                totalSeate += seateTotais[ativ];
            }
            for (var ativ in nahoraTotais) {
                totalNahora += nahoraTotais[ativ];
            }
            
            var todasAtividades = {};
            for (var ativ in seateTotais) {
                todasAtividades[ativ] = { seate: seateTotais[ativ], nahora: nahoraTotais[ativ] || 0 };
            }
            for (var ativ in nahoraTotais) {
                if (todasAtividades[ativ]) {
                    todasAtividades[ativ].nahora = nahoraTotais[ativ];
                } else {
                    todasAtividades[ativ] = { seate: 0, nahora: nahoraTotais[ativ] };
                }
            }
            
            var items = [];
            for (var ativ in todasAtividades) {
                var total = todasAtividades[ativ].seate + todasAtividades[ativ].nahora;
                if (total > 0) {
                    items.push({ nome: ativ, seate: todasAtividades[ativ].seate, nahora: todasAtividades[ativ].nahora, total: total });
                }
            }
            items.sort(function(a, b) { return b.total - a.total; });
            
            if (items.length === 0) {
                container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Nenhum registro encontrado para 2026</p>';
                document.getElementById("modalAnaliseAtividade").style.display = "block";
                return;
            }
            
            html += '<div class="titulo-secao">📍 ATIVIDADES - 2026</div>';
            html += '<div class="tabela-estatistica-container">';
            html += '<table class="tabela-estatistica">';
            html += '<thead><tr>';
            html += '<th style="text-align:left; min-width:200px;">Atividade</th>';
            html += '<th style="text-align:center; background:#0F2D52; color:#fff;">SEATE</th>';
            html += '<th style="text-align:center; background:#B30000; color:#fff;">NAHORA</th>';
            html += '<th style="text-align:center; background:var(--destaque); color:var(--azul-marinho);">TOTAL</th>';
            html += '</tr></thead><tbody>';
            
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                html += '<tr>';
                html += '<td style="text-align:left; font-weight:500; color:var(--azul-marinho);">' + escapeHtml(item.nome) + '</td>';
                html += '<td style="text-align:center; font-weight:600;">' + item.seate.toLocaleString() + '</td>';
                html += '<td style="text-align:center; font-weight:600;">' + item.nahora.toLocaleString() + '</td>';
                html += '<td style="text-align:center; font-weight:700; background:var(--cinza-suave);">' + item.total.toLocaleString() + '</td>';
                html += '</tr>';
            }
            
            html += '<tr style="font-weight:700; background:var(--cinza-suave);">';
            html += '<td style="text-align:left; color:var(--azul-marinho);">TOTAL GERAL</td>';
            html += '<td style="text-align:center; background:#0F2D52; color:#fff;">' + totalSeate.toLocaleString() + '</td>';
            html += '<td style="text-align:center; background:#B30000; color:#fff;">' + totalNahora.toLocaleString() + '</td>';
            html += '<td style="text-align:center; background:var(--destaque); color:var(--azul-marinho);">' + (totalSeate + totalNahora).toLocaleString() + '</td>';
            html += '</tr>';
            html += '</tbody></table></div>';
            
            container.innerHTML = html;
            document.getElementById("modalAnaliseAtividade").style.display = "block";
            return;
        }
        
        var dadosPre = window.dadosPreenchidos ? window.dadosPreenchidos[ano] : null;
        
        if (!dadosPre) {
            container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Dados não disponíveis para este ano.</p>';
            document.getElementById("modalAnaliseAtividade").style.display = "block";
            return;
        }
        
        var seateData = dadosPre["SEATE"] || {};
        var nahoraData = dadosPre["NAHORA"] || {};
        
        var todasAtividades = {};
        for (var ativ in seateData) {
            var valor = seateData[ativ];
            if (Array.isArray(valor)) {
                valor = valor.reduce(function(a, b) { return a + b; }, 0);
            }
            todasAtividades[ativ] = { seate: valor, nahora: 0 };
            totalSeate += valor;
        }
        for (var ativ in nahoraData) {
            var valor = nahoraData[ativ];
            if (Array.isArray(valor)) {
                valor = valor.reduce(function(a, b) { return a + b; }, 0);
            }
            if (todasAtividades[ativ]) {
                todasAtividades[ativ].nahora = valor;
            } else {
                todasAtividades[ativ] = { seate: 0, nahora: valor };
            }
            totalNahora += valor;
        }
        
        var items = [];
        for (var ativ in todasAtividades) {
            var total = todasAtividades[ativ].seate + todasAtividades[ativ].nahora;
            if (total > 0) {
                items.push({ nome: ativ, seate: todasAtividades[ativ].seate, nahora: todasAtividades[ativ].nahora, total: total });
            }
        }
        items.sort(function(a, b) { return b.total - a.total; });
        
        if (items.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Nenhum dado disponível para ' + ano + '</p>';
            document.getElementById("modalAnaliseAtividade").style.display = "block";
            return;
        }
        
        html += '<div class="titulo-secao">📍 ATIVIDADES - ' + ano + '</div>';
        html += '<div class="tabela-estatistica-container">';
        html += '<table class="tabela-estatistica">';
        html += '<thead><tr>';
        html += '<th style="text-align:left; min-width:200px;">Atividade</th>';
        html += '<th style="text-align:center; background:#0F2D52; color:#fff;">SEATE</th>';
        html += '<th style="text-align:center; background:#B30000; color:#fff;">NAHORA</th>';
        html += '<th style="text-align:center; background:var(--destaque); color:var(--azul-marinho);">TOTAL</th>';
        html += '</tr></thead><tbody>';
        
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            html += '<tr>';
            html += '<td style="text-align:left; font-weight:500; color:var(--azul-marinho);">' + escapeHtml(item.nome) + '</td>';
            html += '<td style="text-align:center; font-weight:600;">' + item.seate.toLocaleString() + '</td>';
            html += '<td style="text-align:center; font-weight:600;">' + item.nahora.toLocaleString() + '</td>';
            html += '<td style="text-align:center; font-weight:700; background:var(--cinza-suave);">' + item.total.toLocaleString() + '</td>';
            html += '</tr>';
        }
        
        html += '<tr style="font-weight:700; background:var(--cinza-suave);">';
        html += '<td style="text-align:left; color:var(--azul-marinho);">TOTAL GERAL</td>';
        html += '<td style="text-align:center; background:#0F2D52; color:#fff;">' + totalSeate.toLocaleString() + '</td>';
        html += '<td style="text-align:center; background:#B30000; color:#fff;">' + totalNahora.toLocaleString() + '</td>';
        html += '<td style="text-align:center; background:var(--destaque); color:var(--azul-marinho);">' + (totalSeate + totalNahora).toLocaleString() + '</td>';
        html += '</tr>';
        html += '</tbody></table></div>';
        
        container.innerHTML = html;
        document.getElementById("modalAnaliseAtividade").style.display = "block";
        
    } catch(e) {
        console.warn('Erro ao abrir modal de análise:', e.message);
        feedback("Erro ao abrir análise detalhada!");
    }
}

function criarModalAnaliseAtividade() {
    if (document.getElementById("modalAnaliseAtividade")) {
        return;
    }
    
    var modalHTML = `
    <div id="modalAnaliseAtividade" class="modal-estatistica">
        <div class="modal-estatistica-content">
            <div class="modal-estatistica-header">
                <h3 id="modalAnaliseTitulo">📊 Análise Detalhada por Atividade</h3>
                <span class="modal-close" onclick="fecharModalAnaliseAtividade()">&times;</span>
            </div>
            <div class="modal-estatistica-body">
                <div id="listaAnaliseAtividades"></div>
                <div style="margin-top:12px; text-align:right; font-size:0.75rem; color:#888;">
                    💡 Clique em "Fechar" para voltar
                </div>
            </div>
            <div class="modal-estatistica-footer">
                <button class="btn btn-neutral" onclick="fecharModalAnaliseAtividade()">Fechar</button>
            </div>
        </div>
    </div>
    `;
    
    var div = document.createElement('div');
    div.innerHTML = modalHTML;
    document.body.appendChild(div.firstElementChild);
}

function fecharModalAnaliseAtividade() {
    var modal = document.getElementById("modalAnaliseAtividade");
    if (modal) {
        modal.style.display = "none";
    }
}

document.addEventListener('click', function(event) {
    var modal = document.getElementById("modalAnaliseAtividade");
    if (modal && event.target === modal) {
        fecharModalAnaliseAtividade();
    }
});

// ==================== INICIALIZAÇÃO ====================
// Verificar se a configuração centralizada está disponível
if (!window.SUPABASE_CONFIG) {
    console.warn('⚠️ SUPABASE_CONFIG não encontrado. Usando valores diretos.');
}

// Inicializar Supabase
initSupabase();

setTimeout(function() {
    if (!usarSupabase) {
        logDebug('🔄 Segunda tentativa de conectar ao Supabase...');
        initSupabase();
    }
}, 1000);

setTimeout(function() {
    if (!usarSupabase) {
        logDebug('🔄 Terceira tentativa de conectar ao Supabase...');
        initSupabase();
    }
}, 3000);

logDebug('📋 common.js carregado com sucesso! (Sem conflito de declarações)');
logDebug('🔗 Usando URL:', getSupabaseUrl());

// Exportar funções para uso global
window.initSupabase = initSupabase;
window.salvarServidores = salvarServidores;
window.salvarLotacoes = salvarLotacoes;
window.salvarBloqueios = salvarBloqueios;
window.salvarAtividades = salvarAtividades;
window.salvarAtribuicoes = salvarAtribuicoes;
window.salvarTudo = salvarTudo;
window.carregarDados = carregarDados;
window.carregarDadosLocal = carregarDadosLocal;
window.getDadosEstatisticosAno = getDadosEstatisticosAno;
window.getDadosAtividadeAno = getDadosAtividadeAno;
window.recalcularTotalLinha = recalcularTotalLinha;
window.calcularTotalAtividade = calcularTotalAtividade;
window.salvarConfigMes = salvarConfigMes;
window.getStatusServidor = getStatusServidor;
window.getLotacaoServidor = getLotacaoServidor;
window.gerarLink = gerarLink;
window.copiarLink = copiarLink;
window.acessarRegistro = acessarRegistro;
window.toggleBloqueio = toggleBloqueio;
window.verificarPreenchimento = verificarPreenchimento;
window.feedback = feedback;
window.atualizarDisplayMes = atualizarDisplayMes;
window.fecharModalEdicaoServidor = fecharModalEdicaoServidor;
window.fecharModalEdicao = fecharModalEdicao;
window.fecharModalEdicaoVisualizacao = fecharModalEdicaoVisualizacao;
window.fecharModalEstatistica = fecharModalEstatistica;
window.atualizarSelects = atualizarSelects;
window.atualizarSelectVisualizacao = atualizarSelectVisualizacao;
window.atualizarQuadroAtividadesServidor = atualizarQuadroAtividadesServidor;
window.renderizarListaServidoresAtribuicoes = renderizarListaServidoresAtribuicoes;
window.selecionarServidorAtribuicoes = selecionarServidorAtribuicoes;
window.excluirAtividadeDoServidor = excluirAtividadeDoServidor;
window.renderizarAtribuicoes = renderizarAtribuicoes;
window.removerAtribuicao = removerAtribuicao;
window.abrirModalEdicao = abrirModalEdicao;
window.confirmarEdicaoAtividade = confirmarEdicaoAtividade;
window.abrirModalEdicaoVisualizacao = abrirModalEdicaoVisualizacao;
window.confirmarEdicaoAtividadeVisualizacao = confirmarEdicaoAtividadeVisualizacao;
window.configurarNavegacao = configurarNavegacao;
window.abrirModalEstatistica = abrirModalEstatistica;
window.salvarDadosEstatisticaModal = salvarDadosEstatisticaModal;
window.abrirModalAnaliseAtividade = abrirModalAnaliseAtividade;
window.criarModalAnaliseAtividade = criarModalAnaliseAtividade;
window.fecharModalAnaliseAtividade = fecharModalAnaliseAtividade;
