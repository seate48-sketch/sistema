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

// ---- Duração máxima do login: 2 horas a partir da entrada ----
// O horário do login fica guardado neste navegador. Passadas 2 horas, a
// sessão é encerrada e é preciso entrar de novo (aviso 5 minutos antes).
var DURACAO_SESSAO_MS = 2 * 60 * 60 * 1000;
var AVISO_SESSAO_MS = 5 * 60 * 1000;
var CHAVE_LOGIN_EM = 'seate_login_em';
var _loginEmMemoria = null, _vigiaSessao = null, _avisouSessao = false;

function registrarInicioSessao() {
    _loginEmMemoria = Date.now();
    try { localStorage.setItem(CHAVE_LOGIN_EM, String(_loginEmMemoria)); } catch (e) {}
    _avisouSessao = false;
    vigiarSessao();
}
function _horaLogin() {
    var t = null;
    try { t = parseInt(localStorage.getItem(CHAVE_LOGIN_EM), 10); } catch (e) {}
    if (!t || isNaN(t)) t = _loginEmMemoria;
    return t || null;
}
function tempoRestanteSessao() {
    var t = _horaLogin();
    if (!t || t > Date.now() + 5 * 60 * 1000) return 0; // sem registro (ou relógio adiantado): exige novo login
    return Math.max(0, t + DURACAO_SESSAO_MS - Date.now());
}
async function _encerrarSessao() {
    _loginEmMemoria = null;
    try { localStorage.removeItem(CHAVE_LOGIN_EM); } catch (e) {}
    if (usarSupabase && supabaseClient) {
        try { await supabaseClient.auth.signOut(); } catch (e) { console.warn('Erro ao sair:', e.message); }
    }
}
function _caixaSessao(id, html) {
    var velha = document.getElementById(id); if (velha) velha.remove();
    var el = document.createElement('div');
    el.id = id;
    el.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10100;display:flex;align-items:center;justify-content:center;padding:16px;';
    el.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:440px;width:100%;padding:22px 24px;box-shadow:0 20px 50px rgba(0,0,0,.3);font-size:14px;color:#1F2937;line-height:1.5;">' + html + '</div>';
    document.body.appendChild(el);
    return el;
}
function _hhmm(ms) { var d = new Date(ms); return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0'); }
function vigiarSessao() {
    if (_vigiaSessao) return;
    _vigiaSessao = setInterval(async function () {
        var resta = tempoRestanteSessao();
        if (resta <= 0) {
            clearInterval(_vigiaSessao); _vigiaSessao = null;
            var aviso = document.getElementById('avisoSessao'); if (aviso) aviso.remove();
            await _encerrarSessao();
            var el = _caixaSessao('fimSessao',
                '<h3 style="margin:0 0 8px;color:#0B2A4A;font-size:18px;">🔒 Sessão encerrada</h3>' +
                '<p style="margin:0 0 6px;">Por segurança, o acesso ao sistema dura no máximo <b>2 horas</b> a partir do login, e esse tempo terminou.</p>' +
                '<p style="margin:0 0 16px;">Para continuar, faça o login novamente com seu e-mail e senha.</p>' +
                '<div style="text-align:right"><button id="fimSessaoOk" style="background:#1D4ED8;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;">FAZER LOGIN</button></div>');
            el.querySelector('#fimSessaoOk').onclick = function () { window.location.href = 'index.html'; };
            return;
        }
        if (resta <= AVISO_SESSAO_MS && !_avisouSessao) {
            _avisouSessao = true;
            var fim = _horaLogin() + DURACAO_SESSAO_MS;
            var el2 = _caixaSessao('avisoSessao',
                '<h3 style="margin:0 0 8px;color:#92400E;font-size:18px;">⏰ Sua sessão está terminando</h3>' +
                '<p style="margin:0 0 6px;">O acesso ao sistema dura no máximo <b>2 horas</b> a partir do login. Sua sessão será encerrada às <b>' + _hhmm(fim) + '</b> (em cerca de ' + Math.max(1, Math.round(resta / 60000)) + ' minutos).</p>' +
                '<p style="margin:0 0 16px;"><b>Salve agora</b> o que estiver fazendo. Depois disso, será preciso fazer o login novamente.</p>' +
                '<div style="text-align:right"><button id="avisoSessaoOk" style="background:#1D4ED8;color:#fff;border:none;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;">ENTENDI</button></div>');
            el2.querySelector('#avisoSessaoOk').onclick = function () { el2.remove(); };
        }
    }, 15000);
}

// Usada por index.html (que exibe o modal de login embutido em vez de redirecionar)
async function obterSessaoAtual() {
    if (!usarSupabase || !supabaseClient) return null;
    try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data || !data.session) return null;
        if (tempoRestanteSessao() <= 0) { await _encerrarSessao(); return null; } // passou de 2 horas
        vigiarSessao();
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
    await _encerrarSessao();
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
// ==================== ANOS EXIBIDOS (botões, cartões, filtros) ====================
// Vão de 2022 até o MAIOR entre: o ano de hoje, o ano de referência definido
// pelo gestor na tela Principal e o ano do lançamento mais recente de qualquer
// servidor. Assim um ano novo aparece assim que o gestor abre o mês de
// referência (ex.: Janeiro/2027) ou que alguém lança algo nele — mesmo antes
// da virada no calendário. (Limite: no máximo 1 ano à frente de hoje, para
// uma data digitada errada não criar anos fantasmas.)
var _anoMaximoExtra = 0;
function _anoValido(a) {
    a = parseInt(a, 10);
    return (!isNaN(a) && a >= 2022 && a <= parseInt(ANO_ATUAL, 10) + 1) ? a : 0;
}
async function atualizarAnoMaximo() {
    var maior = 0;
    try {
        if (typeof dbCarregarConfiguracao === 'function') {
            var cfg = await dbCarregarConfiguracao();
            if (cfg) maior = Math.max(maior, _anoValido(cfg.ano));
        }
    } catch (e) { console.warn('Anos exibidos (configuração):', e.message); }
    try {
        if (typeof db !== 'undefined' && db && typeof db.from === 'function') {
            var r = await db.from(getTables().REGISTROS).select('data').order('data', { ascending: false }).limit(1);
            if (r && !r.error && r.data && r.data[0] && r.data[0].data) maior = Math.max(maior, _anoValido(String(r.data[0].data).slice(0, 4)));
        }
    } catch (e) { console.warn('Anos exibidos (registros):', e.message); }
    if (maior) _anoMaximoExtra = Math.max(_anoMaximoExtra, maior);
    return _anoMaximoExtra;
}
function getAnosDisponiveis() {
    var fim = Math.max(parseInt(ANO_ATUAL, 10), _anoMaximoExtra || 0,
                       (typeof anoConfigurado !== 'undefined') ? _anoValido(anoConfigurado) : 0);
    var anos = [];
    for (var y = 2022; y <= fim; y++) { anos.push(String(y)); }
    return anos;
}

// ==================== INDICADORES GERAIS: DISTRIBUIÇÃO DOS CARTÕES ====================
// 4 cartões por linha; o TOTAL GERAL completa a última linha com a largura
// que sobrar (sempre em destaque). Usado pela Principal, Estatística e Dashboard.
function distribuirIndicadores(container) {
    if (!container) return;
    var anosCards = container.querySelectorAll('.indicador-card');
    var total = container.querySelector('.indicador-card-total');
    var n = anosCards.length;
    if (!n) return;
    var largura = window.innerWidth || 1200;
    // 4 colunas (2 no tablet, 1 no celular); os anos preenchem as linhas de
    // cima e o TOTAL GERAL ocupa o espaço que sobra na última linha
    // (ex.: 6 anos -> 4 em cima e, embaixo, 2 anos + TOTAL largo). Se sobraria
    // só 1 espaço, o TOTAL vai para uma linha inteira, para ficar em evidência.
    var colunas = largura < 600 ? 1 : (largura < 900 ? 2 : 4);
    container.style.gridTemplateColumns = 'repeat(' + colunas + ', minmax(0, 1fr))';
    if (total) {
        var resto = n % colunas;
        var vagas = resto === 0 ? colunas : colunas - resto;
        total.style.gridColumn = (vagas >= 2 || colunas === 1) ? ('span ' + vagas) : '1 / -1';
        total.style.padding = '12px 16px';
        total.style.borderWidth = '1.5px';
        total.style.borderColor = '#1F4E79';
        var v = total.querySelector('.indicador-valor');
        if (v) v.style.fontSize = '2.1rem';
    }
}
if (typeof window !== 'undefined' && !window._distribuirIndicadoresResize) {
    window._distribuirIndicadoresResize = true;
    window.addEventListener('resize', function () {
        var g = document.getElementById('indicadoresGrid');
        if (g) distribuirIndicadores(g);
    });
}

// ==================== FONTE DOS NÚMEROS DE CADA ANO ====================
// Regra (vale para qualquer ano, sem precisar mexer no código na virada):
//   * 2022 a 2025 -> só "Dados Estatísticos" (digitados pelo gestor)
//   * 2026        -> registros dos servidores + meses digitados antes do
//                    sistema entrar em uso (continua assim mesmo depois
//                    que 2026 deixar de ser o ano atual)
//   * 2027 em diante -> EXCLUSIVAMENTE os registros dos servidores; não há
//                    mais digitação manual (para corrigir, o gestor altera
//                    o lançamento no registro do servidor)
var ANO_INICIO_REGISTROS = 2026;
var ANO_SO_REGISTROS = 2027;
function anoUsaRegistros(ano) { return parseInt(ano, 10) >= ANO_INICIO_REGISTROS; }
function anoSoRegistros(ano) { return parseInt(ano, 10) >= ANO_SO_REGISTROS; }

// ==================== TOTAIS DOS REGISTROS DE UM ANO (SUPABASE) ====================
var _totaisAnoCache = {};
function obterTotaisAno(ano) {
    ano = String(ano);
    if (!anoUsaRegistros(ano)) {
        var MESES_V = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
        var vazio = { totalGeral: 0, seateTotal: 0, nahoraTotal: 0, porAtividadeSeate: {}, porAtividadeNahora: {}, porMes: {}, porAtividadeMesSeate: {}, porAtividadeMesNahora: {} };
        MESES_V.forEach(function(m) { vazio.porMes[m] = 0; });
        return Promise.resolve(vazio);
    }
    if (!_totaisAnoCache[ano]) { _totaisAnoCache[ano] = dbCarregarTotaisAno(ano); }
    return _totaisAnoCache[ano];
}
function obterTotaisAnoAtual() { return obterTotaisAno(ANO_ATUAL); }

// ==================== CALCULAR TOTAL DO ANO ATUAL ====================
async function calcularTotalAnoAtual() {
    var totais = await obterTotaisAnoAtual();
    return totais.totalGeral;
}

// ==================== DADOS HISTÓRICOS (2022 a 2025, EDITÁVEIS NO SUPABASE) ====================
// Generalizado: TODOS os anos (2022, 2023, 2024, 2025) vivem 100% na tabela
// "dados_historicos" do Supabase agora — nada mais fica fixo no código nem
// no localStorage. Um cache por ano evita buscas repetidas na mesma sessão.
var _dadosAnoCache = {};
function obterDadosAno(ano) {
    ano = String(ano);
    // de 2027 em diante não existe digitação manual: nada a somar
    if (anoSoRegistros(ano)) { return Promise.resolve({ SEATE: {}, NAHORA: {} }); }
    if (!_dadosAnoCache[ano]) { _dadosAnoCache[ano] = dbCarregarDadosAno(ano); }
    return _dadosAnoCache[ano];
}
function invalidarCacheDadosAno(ano) {
    if (ano) { delete _dadosAnoCache[String(ano)]; }
    else { _dadosAnoCache = {}; }
}

// Retorna {seateTotal, nahoraTotal} para qualquer ano do painel, decidindo a
// fonte certa: ano atual -> Supabase (registros, ao vivo, herdado do que
// cada servidor preencheu); os demais anos -> Supabase (dados_historicos,
// alimentados manualmente pelo gestor).
async function obterSeateNahoraPorAno(ano) {
    ano = String(ano);
    if (anoUsaRegistros(ano)) {
        // Ano corrente = registros reais dos servidores (automático, mês a
        // mês conforme cada um preenche) SOMADO com o que o gestor alimentar
        // manualmente em "Dados Estatísticos" para os meses ainda sem
        // registro — os dois nunca se sobrepõem porque tratam de meses
        // diferentes, então somar é seguro.
        var t = await obterTotaisAno(ano);
        var manual = await obterDadosAno(ano);
        var seateManual = 0, nahoraManual = 0;
        if (manual) {
            for (var ativ in manual.SEATE) { for (var m in manual.SEATE[ativ]) seateManual += manual.SEATE[ativ][m] || 0; }
            for (var ativ in manual.NAHORA) { for (var m in manual.NAHORA[ativ]) nahoraManual += manual.NAHORA[ativ][m] || 0; }
        }
        return { seateTotal: t.seateTotal + seateManual, nahoraTotal: t.nahoraTotal + nahoraManual };
    }
    var dadosAno = await obterDadosAno(ano);
    if (!dadosAno) return { seateTotal: 0, nahoraTotal: 0 };
    var seateTotal = 0, nahoraTotal = 0;
    for (var ativ in dadosAno.SEATE) { for (var m in dadosAno.SEATE[ativ]) seateTotal += dadosAno.SEATE[ativ][m] || 0; }
    for (var ativ in dadosAno.NAHORA) { for (var m in dadosAno.NAHORA[ativ]) nahoraTotal += dadosAno.NAHORA[ativ][m] || 0; }
    return { seateTotal: seateTotal, nahoraTotal: nahoraTotal };
}

// ==================== ATIVIDADES POR SETOR (MESMA LISTA DE "ADICIONAR/ATIVIDADES") ====================
var _atividadesPorSetorCache = {};
function obterAtividadesPorSetor(setor) {
    if (!_atividadesPorSetorCache[setor]) { _atividadesPorSetorCache[setor] = dbCarregarAtividadesPorSetor(setor); }
    return _atividadesPorSetorCache[setor];
}

// ==================== FORMATAÇÃO DE NÚMEROS (PADRÃO 000.000) ====================
function formatarMilhar(valor) {
    return (valor || 0).toLocaleString('pt-BR');
}
window.formatarMilhar = formatarMilhar;

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
async function inativarServidorNoBanco(nome) {
    if (!usarSupabase || !supabaseClient) return;
    try {
        const { error } = await supabaseClient.from(getTables().SERVIDORES).update({ ativo: false }).eq('nome', nome);
        if (error) console.error('Erro ao inativar servidor "' + nome + '" no Supabase:', error.message);
    } catch (e) {
        console.error('❌ Erro em inativarServidorNoBanco:', e.message);
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

// ==================== EXCLUSÃO DE SERVIDOR COM VERIFICAÇÃO ====================
// Antes de excluir, consulta no banco (levantamento_servidor) quantos
// registros e relatórios entregues a pessoa tem e explica as opções:
//  • INATIVAR (padrão): sai das listas, histórico mantido nos totais;
//  • EXCLUIR DEFINITIVAMENTE: só sem relatório entregue; apaga cadastro e
//    registros (os totais diminuem). Exige digitar o nome.
// Retorna 'inativado', 'excluido' ou null (cancelado). A ação no banco já
// é feita aqui; a página só atualiza as listas locais.
function _exsEsc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function _exsNum(n) { return Number(n || 0).toLocaleString('pt-BR'); }
function _exsData(iso) { if (!iso) return '—'; var p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function _exsPlural(n, um, varios) { return _exsNum(n) + ' ' + (Number(n) === 1 ? um : varios); }
// separa os anos cujos registros entram nos totais (2026 em diante) dos anos com lançamento manual
function _exsContabil(anos) {
    var conta = [], fora = [], total = 0;
    (anos || []).forEach(function (a) {
        if (!a.total) return;
        if (typeof anoUsaRegistros !== 'function' || anoUsaRegistros(a.ano)) { conta.push(a); total += Number(a.total); }
        else fora.push(a);
    });
    return { conta: conta, fora: fora, total: total };
}
var _EXS_MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function _exsEstilo() {
    if (document.getElementById('exs-estilo')) return;
    var st = document.createElement('style');
    st.id = 'exs-estilo';
    st.textContent =
        '#exsFundo{position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;}' +
        '#exsFundo .exs-caixa{background:#fff;border-radius:16px;max-width:620px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.3);padding:22px 24px;font-size:14px;color:#1F2937;line-height:1.5;}' +
        '#exsFundo h3{margin:0 0 4px;font-size:18px;color:#0B2A4A;}' +
        '#exsFundo .exs-sub{color:#6B7280;font-size:13px;margin-bottom:14px;}' +
        '#exsFundo .exs-resumo{background:#F3F6FA;border:1px solid #DDE4EE;border-radius:10px;padding:12px 14px;margin-bottom:14px;}' +
        '#exsFundo .exs-resumo b{color:#0B2A4A;}' +
        '#exsFundo ul{margin:6px 0 0;padding-left:20px;}' +
        '#exsFundo li{margin:2px 0;}' +
        '#exsFundo .exs-op{border:1px solid #DDE4EE;border-radius:12px;padding:12px 14px;margin-bottom:10px;}' +
        '#exsFundo .exs-op h4{margin:0 0 4px;font-size:15px;}' +
        '#exsFundo .exs-op.rec{border-color:#93C5FD;background:#F0F7FF;}' +
        '#exsFundo .exs-op.rec h4{color:#1D4ED8;}' +
        '#exsFundo .exs-op.perigo{border-color:#FCA5A5;background:#FFF5F5;}' +
        '#exsFundo .exs-op.perigo h4{color:#B91C1C;}' +
        '#exsFundo .exs-op.bloq{border-color:#E5E7EB;background:#F9FAFB;color:#4B5563;}' +
        '#exsFundo .exs-op.bloq h4{color:#6B7280;}' +
        '#exsFundo .exs-quando{font-size:13px;color:#374151;margin-bottom:2px;}' +
        '#exsFundo .exs-alerta{background:#FEF2F2;border:1px solid #FCA5A5;color:#991B1B;border-radius:10px;padding:10px 12px;margin:10px 0;}' +
        '#exsFundo .exs-info{background:#FFFBEB;border:1px solid #FCD34D;color:#92400E;border-radius:10px;padding:10px 12px;margin:10px 0;}' +
        '#exsFundo input{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #CBD5E1;border-radius:8px;font-size:14px;margin-top:6px;}' +
        '#exsFundo .exs-botoes{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px;}' +
        '#exsFundo button{border:none;border-radius:8px;padding:9px 16px;font-weight:700;font-size:13px;cursor:pointer;}' +
        '#exsFundo .b-cancelar{background:#E5E7EB;color:#374151;}' +
        '#exsFundo .b-inativar{background:#1D4ED8;color:#fff;}' +
        '#exsFundo .b-excluir{background:#DC2626;color:#fff;}' +
        '#exsFundo button:disabled{opacity:.45;cursor:not-allowed;}' +
        '#exsFundo .exs-op button{margin-top:8px;}';
    document.head.appendChild(st);
}

async function _exsIdServidor(nome) {
    var r = await supabaseClient.from(getTables().SERVIDORES).select('id, nome, ativo').eq('nome', nome);
    if (r.error || !r.data || !r.data.length) return null;
    var mesmos = r.data.filter(function (s) { return s.nome === nome; });
    if (!mesmos.length) return null;
    var ativo = mesmos.filter(function (s) { return s.ativo !== false; })[0] || mesmos[0];
    return String(ativo.id);
}

function dialogoExclusaoServidor(nome) {
    return new Promise(function (resolver) {
        _exsEstilo();
        var fundo = document.createElement('div');
        fundo.id = 'exsFundo';
        fundo.innerHTML = '<div class="exs-caixa" role="dialog" aria-modal="true"></div>';
        document.body.appendChild(fundo);
        var caixa = fundo.firstChild;
        var N = '<b>' + _exsEsc(nome) + '</b>';
        var idServ = null, lev = null;

        function fechar(res) { fundo.remove(); resolver(res); }
        function tela(html) { caixa.innerHTML = html; caixa.scrollTop = 0; }
        function ligar(id, fn) { var b = document.getElementById(id); if (b) b.onclick = fn; }

        // --- ações no banco ---
        async function inativar() {
            tela('<h3>Inativando…</h3><div class="exs-sub">Aguarde um instante.</div>');
            await inativarServidorNoBanco(nome);
            fechar('inativado');
        }
        async function excluir() {
            tela('<h3>Excluindo…</h3><div class="exs-sub">Apagando o cadastro e os registros de ' + N + '. Não feche a página.</div>');
            try {
                var r = await supabaseClient.rpc('excluir_servidor_definitivo', { p_servidor: idServ });
                if (r.error) throw new Error(r.error.message || 'erro');
                if (typeof invalidarCacheTotaisAno === 'function') invalidarCacheTotaisAno();
                else if (typeof _totaisAnoCache !== 'undefined') { for (var k in _totaisAnoCache) delete _totaisAnoCache[k]; }
                fechar('excluido');
            } catch (e) {
                var msg = String(e.message || e);
                var motivo = msg.indexOf('TEM_RELATORIOS_ENTREGUES') !== -1
                    ? 'Foi encontrado relatório entregue por esta pessoa. Por segurança, a exclusão definitiva não é permitida nesse caso.'
                    : 'Não foi possível concluir a exclusão (' + _exsEsc(msg) + '). Nenhum dado foi apagado — a operação é "tudo ou nada".';
                tela('<h3>Exclusão não realizada</h3><div class="exs-alerta">' + motivo + '</div>' +
                     '<div class="exs-botoes"><button class="b-cancelar" id="exsFechar">FECHAR</button></div>');
                ligar('exsFechar', function () { fechar(null); });
            }
        }

        // --- textos reutilizados ---
        var TXT_INATIVAR =
            '<div class="exs-quando"><b>Quando usar:</b> a pessoa saiu da equipe, mudou de setor, aposentou-se ou está afastada por longo período.</div>' +
            '<ul><li>Deixa de aparecer na lista de servidores, nas seleções, nas atribuições e no Acesso Rápido aos Registros.</li>' +
            '<li><b>Nada é apagado:</b> os registros continuam guardados e <b>continuam contando nos totais estatísticos</b> (SEATE/NAHORA, gráficos e relatórios).</li>' +
            '<li>Os relatórios entregues continuam no painel Relatórios Entregues, com a indicação "(inativo)".</li></ul>';

        function telaResumo() {
            var reg = lev.registros || {}, anos = lev.anos || [], ent = lev.entregas || 0;
            var temReg = (reg.dias || 0) > 0;
            // Caso 1: sem nada → confirmação simples
            if (!temReg && !ent) {
                tela('<h3>Excluir ' + _exsEsc(nome) + '?</h3>' +
                     '<div class="exs-sub">Verifiquei o banco de dados antes de excluir.</div>' +
                     '<div class="exs-resumo">✅ ' + N + ' <b>não tem nenhum registro de atividade</b> e <b>nenhum relatório entregue</b>.</div>' +
                     '<p>Por isso, o cadastro pode ser <b>apagado definitivamente</b> sem nenhum efeito nos totais estatísticos:</p>' +
                     '<ul><li>sai da lista de servidores, das seleções, das atribuições e do Acesso Rápido;</li>' +
                     '<li>o cadastro é removido do banco de dados.</li></ul>' +
                     '<div class="exs-info">Esta ação não pode ser desfeita. Se precisar da pessoa novamente, basta cadastrá-la outra vez.</div>' +
                     '<div class="exs-botoes"><button class="b-cancelar" id="exsCancelar">CANCELAR</button>' +
                     '<button class="b-excluir" id="exsExcluir">EXCLUIR</button></div>');
                ligar('exsCancelar', function () { fechar(null); });
                ligar('exsExcluir', excluir);
                return;
            }
            // Resumo do que existe
            var r = '<div class="exs-resumo"><b>O que existe no sistema em nome de ' + _exsEsc(nome) + ':</b><ul>';
            if (temReg) {
                r += '<li><b>' + _exsPlural(reg.dias, 'dia registrado', 'dias registrados') + '</b>, de ' + _exsData(reg.primeiro) + ' a ' + _exsData(reg.ultimo) +
                     ' (' + _exsPlural(reg.dias_ativ, 'dia com atividades lançadas', 'dias com atividades lançadas') +
                     (reg.dias_status ? ' e ' + _exsPlural(reg.dias_status, 'dia com status (Folga, Férias, Atestado…)', 'dias com status (Folga, Férias, Atestado…)') : '') + ');</li>';
                var ct = _exsContabil(anos);
                r += '<li>Esses registros somam <b>' + _exsPlural(ct.total, 'atividade', 'atividades') + '</b> nos totais estatísticos';
                if (ct.conta.length) r += ': ' + ct.conta.map(function (a) { return _exsNum(a.total) + ' em ' + a.ano; }).join('; ');
                r += '.';
                if (ct.fora.length) r += ' <span style="color:#6B7280">(Há também ' + ct.fora.map(function (a) { return _exsNum(a.total) + ' em ' + a.ano; }).join('; ') +
                    ', que não entram nos totais porque esses anos usam os lançamentos manuais de Dados Estatísticos.)</span>';
                r += '</li>';
            } else {
                r += '<li>Nenhum registro de atividade.</li>';
            }
            if (ent) {
                var meses = (lev.meses_entregues || []).map(function (m) { return _EXS_MESES[m.mes - 1] + '/' + m.ano; });
                r += '<li><b>' + _exsPlural(ent, 'relatório mensal entregue', 'relatórios mensais entregues') + '</b>: ' + _exsEsc(meses.join(', ')) + '.</li>';
            } else {
                r += '<li>Nenhum relatório mensal entregue.</li>';
            }
            r += '</ul></div>';

            var h = '<h3>Excluir ' + _exsEsc(nome) + '</h3><div class="exs-sub">Verifiquei o banco de dados antes de excluir. Escolha abaixo o que deseja fazer.</div>' + r;
            h += '<div class="exs-op rec"><h4>① INATIVAR — recomendado</h4>' + TXT_INATIVAR +
                 '<button class="b-inativar" id="exsInativar">INATIVAR</button></div>';
            if (!ent) {
                h += '<div class="exs-op perigo"><h4>② EXCLUIR DEFINITIVAMENTE</h4>' +
                     '<div class="exs-quando"><b>Quando usar:</b> somente se o cadastro foi feito <b>por engano</b> (nome errado, pessoa duplicada) ou foi usado para <b>testes</b>.</div>' +
                     '<ul><li>Apaga o cadastro e <b>todos os ' + _exsPlural(reg.dias, 'dia registrado', 'dias registrados') + '</b>.</li>' +
                     '<li>' + (_exsContabil(anos).total ? '<b>Os totais estatísticos diminuem ' + _exsNum(_exsContabil(anos).total) + '</b>' : 'Os totais estatísticos <b>não mudam</b>') + ' (painel, gráficos, Relatório Estatístico, Resultados por Atividade e por Servidor).</li>' +
                     '<li>PDFs e planilhas que já foram gerados antes não mudam — podem ficar diferentes dos novos.</li>' +
                     '<li><b>Não pode ser desfeito.</b></li></ul>' +
                     '<button class="b-excluir" id="exsDefinitivo">EXCLUIR DEFINITIVAMENTE…</button></div>';
            } else {
                h += '<div class="exs-op bloq"><h4>② Excluir definitivamente — indisponível</h4>' +
                     'Como ' + N + ' já entregou relatório mensal, a exclusão definitiva não é permitida por aqui. ' +
                     'Os relatórios entregues são o comprovante oficial da entrega, e os totais desses meses podem já ter sido informados. ' +
                     'Se a pessoa saiu da equipe, use <b>INATIVAR</b>. Se for realmente necessário apagar (caso excepcional), a exclusão deve ser feita diretamente no banco de dados, pelo suporte técnico.</div>';
            }
            h += '<div class="exs-botoes"><button class="b-cancelar" id="exsCancelar">CANCELAR</button></div>';
            tela(h);
            ligar('exsCancelar', function () { fechar(null); });
            ligar('exsInativar', inativar);
            ligar('exsDefinitivo', telaConfirmar);
        }

        function telaConfirmar() {
            var reg = lev.registros || {}, anos = lev.anos || [];
            var porAno = _exsContabil(anos).conta.map(function (a) { return 'os totais de <b>' + a.ano + '</b> vão diminuir <b>' + _exsNum(a.total) + '</b>'; });
            tela('<h3>Confirmar exclusão definitiva</h3>' +
                 '<div class="exs-sub">Última etapa — leia com atenção.</div>' +
                 '<div class="exs-alerta">Serão apagados <b>o cadastro de ' + _exsEsc(nome) + '</b> e <b>' + _exsPlural(reg.dias, 'dia registrado', 'dias registrados') + '</b>' +
                 (porAno.length ? '; ' + porAno.join('; ') : '') + '.<br>Esta ação <b>não pode ser desfeita</b>.</div>' +
                 '<label>Para confirmar, digite o nome exatamente como aparece: <b>' + _exsEsc(nome) + '</b></label>' +
                 '<input id="exsNome" type="text" autocomplete="off" placeholder="Digite o nome aqui">' +
                 '<div class="exs-botoes"><button class="b-cancelar" id="exsVoltar">VOLTAR</button>' +
                 '<button class="b-excluir" id="exsConfirmar" disabled>EXCLUIR DEFINITIVAMENTE</button></div>');
            var inp = document.getElementById('exsNome'), btn = document.getElementById('exsConfirmar');
            function norm(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
            inp.oninput = function () { btn.disabled = norm(inp.value) !== norm(nome); };
            inp.focus();
            ligar('exsVoltar', telaResumo);
            ligar('exsConfirmar', function () { if (!btn.disabled) excluir(); });
        }

        function telaSemVerificacao(motivo) {
            tela('<h3>Excluir ' + _exsEsc(nome) + '</h3>' +
                 '<div class="exs-info">Não foi possível verificar os registros e relatórios de ' + N + ' agora' + (motivo ? ' (' + _exsEsc(motivo) + ')' : '') + '. ' +
                 'Por segurança, só a opção <b>INATIVAR</b> está disponível. A exclusão definitiva volta a aparecer quando a verificação funcionar.</div>' +
                 '<div class="exs-op rec"><h4>INATIVAR</h4>' + TXT_INATIVAR + '<button class="b-inativar" id="exsInativar">INATIVAR</button></div>' +
                 '<div class="exs-botoes"><button class="b-cancelar" id="exsCancelar">CANCELAR</button></div>');
            ligar('exsCancelar', function () { fechar(null); });
            ligar('exsInativar', inativar);
        }

        tela('<h3>Excluir ' + _exsEsc(nome) + '</h3><div class="exs-sub">Verificando registros e relatórios entregues…</div>');
        (async function () {
            if (!usarSupabase || !supabaseClient) { telaSemVerificacao('sem conexão com o banco de dados'); return; }
            try {
                idServ = await _exsIdServidor(nome);
                if (!idServ) { telaSemVerificacao('cadastro não encontrado no banco'); return; }
                var r = await supabaseClient.rpc('levantamento_servidor', { p_servidor: idServ });
                if (r.error) {
                    var m = String(r.error.message || '');
                    telaSemVerificacao(/levantamento_servidor|function|schema cache/i.test(m) ? 'o banco de dados ainda não recebeu a atualização 13_exclusao_servidor_atividade.sql' : m);
                    return;
                }
                lev = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
                telaResumo();
            } catch (e) { telaSemVerificacao(String(e.message || e)); }
        })();
    });
}

// ==================== EXCLUSÃO DE ATIVIDADE COM VERIFICAÇÃO ====================
// Mesma lógica da exclusão de servidor:
//  • RETIRAR DA LISTA (padrão): sai das listas; lançamentos mantidos nos totais;
//  • EXCLUIR DEFINITIVAMENTE: só se não aparecer em relatório entregue nem em
//    Dados Estatísticos (manual); retira a atividade de todos os registros.
// Retorna 'retirada', 'excluida' ou null (cancelado). A ação no banco já é
// feita aqui; a página só atualiza as listas locais.
function dialogoExclusaoAtividade(nome) {
    return new Promise(function (resolver) {
        _exsEstilo();
        var fundo = document.createElement('div');
        fundo.id = 'exsFundo';
        fundo.innerHTML = '<div class="exs-caixa" role="dialog" aria-modal="true"></div>';
        document.body.appendChild(fundo);
        var caixa = fundo.firstChild;
        var N = '<b>' + _exsEsc(nome) + '</b>';
        var lev = null;

        function fechar(res) { fundo.remove(); resolver(res); }
        function tela(html) { caixa.innerHTML = html; caixa.scrollTop = 0; }
        function ligar(id, fn) { var b = document.getElementById(id); if (b) b.onclick = fn; }
        function limparCaches() {
            if (typeof _totaisAnoCache !== 'undefined') { for (var k in _totaisAnoCache) delete _totaisAnoCache[k]; }
            if (typeof invalidarCacheDadosAno === 'function') invalidarCacheDadosAno();
        }

        async function retirar() {
            tela('<h3>Retirando da lista…</h3><div class="exs-sub">Aguarde um instante.</div>');
            var ok = true;
            if (typeof supabaseDisponivel !== 'undefined' && supabaseDisponivel && typeof dbExcluirAtividade === 'function') {
                try { ok = await dbExcluirAtividade(nome); } catch (e) { ok = false; }
            }
            if (!ok && typeof feedback === 'function') feedback('Atenção: não foi possível retirar do banco de dados. A atividade pode voltar a aparecer.');
            fechar('retirada');
        }
        async function excluir() {
            tela('<h3>Excluindo…</h3><div class="exs-sub">Retirando ' + N + ' de todos os registros. Não feche a página.</div>');
            try {
                var r = await supabaseClient.rpc('excluir_atividade_definitivo', { p_nome: nome });
                if (r.error) throw new Error(r.error.message || 'erro');
                limparCaches();
                fechar('excluida');
            } catch (e) {
                var msg = String(e.message || e), motivo;
                if (msg.indexOf('TEM_RELATORIOS_ENTREGUES') !== -1) motivo = 'A atividade aparece em relatório entregue. Por segurança, a exclusão definitiva não é permitida nesse caso.';
                else if (msg.indexOf('TEM_DADOS_ESTATISTICOS') !== -1) motivo = 'A atividade tem lançamento manual em Dados Estatísticos. Por segurança, a exclusão definitiva não é permitida nesse caso.';
                else motivo = 'Não foi possível concluir a exclusão (' + _exsEsc(msg) + '). Nenhum dado foi alterado — a operação é "tudo ou nada".';
                tela('<h3>Exclusão não realizada</h3><div class="exs-alerta">' + motivo + '</div>' +
                     '<div class="exs-botoes"><button class="b-cancelar" id="exsFechar">FECHAR</button></div>');
                ligar('exsFechar', function () { fechar(null); });
            }
        }

        function txtRetirar(atrib) {
            return '<div class="exs-quando"><b>Quando usar:</b> a atividade deixou de ser realizada, foi substituída por outra ou não deve mais receber lançamentos.</div>' +
                '<ul><li>Sai da lista de atividades e das telas de lançamento: <b>ninguém consegue mais lançar nela</b>.</li>' +
                (atrib ? '<li>Os <b>' + _exsPlural(atrib, 'servidor atribuído', 'servidores atribuídos') + '</b> deixam de tê-la na sua lista.</li>' : '') +
                '<li><b>Nada do que já foi lançado é apagado:</b> as quantidades continuam contando nos totais estatísticos e a atividade continua aparecendo em Resultados por Atividade, nos gráficos e nos relatórios.</li>' +
                '<li>Se um dia for cadastrada de novo <b>com o mesmo nome</b>, ela volta a reunir os lançamentos antigos.</li></ul>';
        }

        function telaResumo() {
            var reg = lev.registros || {}, hist = lev.historico || {}, atrib = lev.atribuicoes || 0, ent = lev.entregas || 0;
            var ct = _exsContabil(lev.anos || []);
            var temAlgo = (reg.dias || 0) > 0 || (hist.lancamentos || 0) > 0 || atrib > 0 || ent > 0;
            if (!temAlgo) {
                tela('<h3>Excluir a atividade ' + _exsEsc(nome) + '?</h3>' +
                     '<div class="exs-sub">Verifiquei o banco de dados antes de excluir.</div>' +
                     '<div class="exs-resumo">✅ A atividade ' + N + ' <b>não tem nenhum lançamento</b> (nem dos servidores, nem em Dados Estatísticos), <b>nenhum servidor atribuído</b> e não aparece em <b>nenhum relatório entregue</b>.</div>' +
                     '<p>Por isso, pode ser <b>apagada definitivamente</b> sem nenhum efeito nos totais estatísticos.</p>' +
                     '<div class="exs-info">Esta ação não pode ser desfeita. Se precisar dela novamente, basta cadastrá-la outra vez.</div>' +
                     '<div class="exs-botoes"><button class="b-cancelar" id="exsCancelar">CANCELAR</button>' +
                     '<button class="b-excluir" id="exsExcluir">EXCLUIR</button></div>');
                ligar('exsCancelar', function () { fechar(null); });
                ligar('exsExcluir', excluir);
                return;
            }
            var r = '<div class="exs-resumo"><b>O que existe no sistema para a atividade ' + _exsEsc(nome) + ':</b><ul>';
            if (reg.dias) {
                r += '<li><b>Registros dos servidores:</b> lançada em ' + _exsPlural(reg.dias, 'dia', 'dias') + ' por ' + _exsPlural(reg.servidores, 'servidor', 'servidores') +
                     ', de ' + _exsData(reg.primeiro) + ' a ' + _exsData(reg.ultimo) + ', somando <b>' + _exsNum(ct.total) + '</b> nos totais estatísticos' +
                     (ct.conta.length ? ' (' + ct.conta.map(function (a) { return _exsNum(a.total) + ' em ' + a.ano; }).join('; ') + ')' : '') + '.' +
                     (ct.fora.length ? ' <span style="color:#6B7280">Há também ' + ct.fora.map(function (a) { return _exsNum(a.total) + ' em ' + a.ano; }).join('; ') + ', que não entram nos totais porque esses anos usam os lançamentos manuais.</span>' : '') + '</li>';
            } else {
                r += '<li><b>Registros dos servidores:</b> nenhum lançamento.</li>';
            }
            if (hist.lancamentos) {
                r += '<li><b>Dados Estatísticos (lançamento manual):</b> ' + _exsPlural(hist.lancamentos, 'lançamento', 'lançamentos') + ', somando <b>' + _exsNum(hist.total) + '</b>' +
                     ((lev.anos_historico || []).length ? ' (' + lev.anos_historico.map(function (a) { return _exsNum(a.total) + ' em ' + a.ano; }).join('; ') + ')' : '') + '.</li>';
            } else {
                r += '<li><b>Dados Estatísticos (lançamento manual):</b> nenhum lançamento.</li>';
            }
            r += '<li><b>Atribuições:</b> ' + (atrib ? _exsPlural(atrib, 'servidor atribuído', 'servidores atribuídos') : 'nenhum servidor atribuído') + '.</li>';
            if (ent) {
                var lista = (lev.relatorios || []).map(function (x) { return _EXS_MESES[x.mes - 1] + '/' + x.ano + ' – ' + x.servidor; });
                var mostra = lista.slice(0, 6).join('; ') + (lista.length > 6 ? '; e mais ' + (lista.length - 6) : '');
                r += '<li><b>Relatórios entregues:</b> aparece em ' + _exsPlural(ent, 'relatório', 'relatórios') + ' (' + _exsEsc(mostra) + ').</li>';
            } else {
                r += '<li><b>Relatórios entregues:</b> não aparece em nenhum.</li>';
            }
            r += '</ul></div>';

            var h = '<h3>Excluir a atividade ' + _exsEsc(nome) + '</h3><div class="exs-sub">Verifiquei o banco de dados antes de excluir. Escolha abaixo o que deseja fazer.</div>' + r;
            h += '<div class="exs-op rec"><h4>① RETIRAR DA LISTA — recomendado</h4>' + txtRetirar(atrib) +
                 '<button class="b-inativar" id="exsRetirar">RETIRAR DA LISTA</button></div>';
            if (!ent && !hist.lancamentos) {
                h += '<div class="exs-op perigo"><h4>② EXCLUIR DEFINITIVAMENTE</h4>' +
                     '<div class="exs-quando"><b>Quando usar:</b> somente se a atividade foi cadastrada <b>por engano</b> (nome errado, duplicada) ou usada para <b>testes</b>.</div>' +
                     '<ul>' + (reg.dias ? '<li>Retira a atividade de <b>todos os ' + _exsPlural(reg.dias, 'dia lançado', 'dias lançados') + '</b> pelos servidores (as outras atividades desses dias não são tocadas).</li>' : '') +
                     '<li>' + (ct.total ? '<b>Os totais estatísticos diminuem ' + _exsNum(ct.total) + '</b>' : 'Os totais estatísticos <b>não mudam</b>') + ' (painel, gráficos, Relatório Estatístico, Resultados por Atividade e por Servidor).</li>' +
                     (atrib ? '<li>Apaga as atribuições e o cadastro da atividade.</li>' : '<li>Apaga o cadastro da atividade.</li>') +
                     '<li>PDFs e planilhas que já foram gerados antes não mudam — podem ficar diferentes dos novos.</li>' +
                     '<li><b>Não pode ser desfeito.</b></li></ul>' +
                     (reg.ficam_vazios ? '<div class="exs-info">⚠️ Em <b>' + _exsPlural(reg.ficam_vazios, 'dia', 'dias') + '</b> esta foi a <b>única</b> atividade lançada. Esses dias ficarão <b>sem lançamento</b>: o servidor precisará preenchê-los de novo, e eles podem aparecer como pendentes na entrega do relatório ou "Em atraso" no Acesso Rápido.</div>' : '') +
                     '<button class="b-excluir" id="exsDefinitivo">EXCLUIR DEFINITIVAMENTE…</button></div>';
            } else {
                var porque = [];
                if (ent) porque.push('aparece em <b>relatório entregue</b> — o comprovante oficial da entrega do servidor');
                if (hist.lancamentos) porque.push('tem <b>lançamento manual em Dados Estatísticos</b> — números oficiais já consolidados');
                h += '<div class="exs-op bloq"><h4>② Excluir definitivamente — indisponível</h4>' +
                     'A atividade ' + N + ' ' + porque.join(' e ') + '. Apagá-la mudaria números que podem já ter sido informados, por isso a exclusão definitiva não é permitida por aqui. ' +
                     'Use <b>RETIRAR DA LISTA</b>. Se for realmente necessário apagar (caso excepcional), a exclusão deve ser feita diretamente no banco de dados, pelo suporte técnico.</div>';
            }
            h += '<div class="exs-botoes"><button class="b-cancelar" id="exsCancelar">CANCELAR</button></div>';
            tela(h);
            ligar('exsCancelar', function () { fechar(null); });
            ligar('exsRetirar', retirar);
            ligar('exsDefinitivo', telaConfirmar);
        }

        function telaConfirmar() {
            var reg = lev.registros || {};
            var porAno = _exsContabil(lev.anos || []).conta.map(function (a) { return 'os totais de <b>' + a.ano + '</b> vão diminuir <b>' + _exsNum(a.total) + '</b>'; });
            tela('<h3>Confirmar exclusão definitiva</h3>' +
                 '<div class="exs-sub">Última etapa — leia com atenção.</div>' +
                 '<div class="exs-alerta">A atividade <b>' + _exsEsc(nome) + '</b> será apagada' +
                 (reg.dias ? ' e retirada de <b>' + _exsPlural(reg.dias, 'dia lançado', 'dias lançados') + '</b>' : '') +
                 (porAno.length ? '; ' + porAno.join('; ') : '') +
                 (reg.ficam_vazios ? '; <b>' + _exsPlural(reg.ficam_vazios, 'dia ficará', 'dias ficarão') + ' sem lançamento</b>' : '') +
                 '.<br>Esta ação <b>não pode ser desfeita</b>.</div>' +
                 '<label>Para confirmar, digite o nome da atividade exatamente como aparece: <b>' + _exsEsc(nome) + '</b></label>' +
                 '<input id="exsNome" type="text" autocomplete="off" placeholder="Digite o nome aqui">' +
                 '<div class="exs-botoes"><button class="b-cancelar" id="exsVoltar">VOLTAR</button>' +
                 '<button class="b-excluir" id="exsConfirmar" disabled>EXCLUIR DEFINITIVAMENTE</button></div>');
            var inp = document.getElementById('exsNome'), btn = document.getElementById('exsConfirmar');
            function norm(s) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase(); }
            inp.oninput = function () { btn.disabled = norm(inp.value) !== norm(nome); };
            inp.focus();
            ligar('exsVoltar', telaResumo);
            ligar('exsConfirmar', function () { if (!btn.disabled) excluir(); });
        }

        function telaSemVerificacao(motivo) {
            tela('<h3>Excluir a atividade ' + _exsEsc(nome) + '</h3>' +
                 '<div class="exs-info">Não foi possível verificar os lançamentos da atividade ' + N + ' agora' + (motivo ? ' (' + _exsEsc(motivo) + ')' : '') + '. ' +
                 'Por segurança, só a opção <b>RETIRAR DA LISTA</b> está disponível. A exclusão definitiva volta a aparecer quando a verificação funcionar.</div>' +
                 '<div class="exs-op rec"><h4>RETIRAR DA LISTA</h4>' + txtRetirar(0) + '<button class="b-inativar" id="exsRetirar">RETIRAR DA LISTA</button></div>' +
                 '<div class="exs-botoes"><button class="b-cancelar" id="exsCancelar">CANCELAR</button></div>');
            ligar('exsCancelar', function () { fechar(null); });
            ligar('exsRetirar', retirar);
        }

        tela('<h3>Excluir a atividade ' + _exsEsc(nome) + '</h3><div class="exs-sub">Verificando lançamentos, atribuições e relatórios entregues…</div>');
        (async function () {
            if (!usarSupabase || !supabaseClient) { telaSemVerificacao('sem conexão com o banco de dados'); return; }
            try {
                var r = await supabaseClient.rpc('levantamento_atividade', { p_nome: nome });
                if (r.error) {
                    var m = String(r.error.message || '');
                    telaSemVerificacao(/levantamento_atividade|function|schema cache/i.test(m) ? 'o banco de dados ainda não recebeu a atualização 13_exclusao_servidor_atividade.sql' : m);
                    return;
                }
                lev = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
                telaResumo();
            } catch (e) { telaSemVerificacao(String(e.message || e)); }
        })();
    });
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
        await atualizarAnoMaximo();
        
        if (usarSupabase && supabaseClient) {
            logDebug('📊 Buscando dados do Supabase...');
            
            try {
                const { data: servidoresData, error: servError } = await supabaseClient
                    .from(TABLES.SERVIDORES)
                    .select('*')
                    .eq('ativo', true)
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
                    .select('servidores(nome), atividades(nome), criado_em')
                    .order('criado_em', { ascending: true });
                
                if (!atribError && atribData) {
                    atribuicoes = {};
                    var _ordemPorServidorLocal = {};
                    for (const item of atribData) {
                        const nomeAtividade = item.atividades ? item.atividades.nome : null;
                        const nomeServidor = item.servidores ? item.servidores.nome : null;
                        if (!nomeAtividade || !nomeServidor) continue;
                        if (!atribuicoes[nomeAtividade]) {
                            atribuicoes[nomeAtividade] = [];
                        }
                        atribuicoes[nomeAtividade].push(nomeServidor);
                        // A busca já vem ordenada por data de criação, então
                        // a atividade mais recente de cada servidor fica
                        // sempre por último aqui — usado para a lista
                        // "Atividades de [servidor]" sempre mostrar a mais
                        // nova no final, em vez de uma ordem sem critério.
                        if (!_ordemPorServidorLocal[nomeServidor]) _ordemPorServidorLocal[nomeServidor] = [];
                        _ordemPorServidorLocal[nomeServidor].push(nomeAtividade);
                    }
                    window._ordemAtribuicoesPorServidor = _ordemPorServidorLocal;
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
        // um ano de referência novo (ex.: Janeiro/2027) já passa a aparecer
        if(typeof renderizarBotoesAnos === 'function') renderizarBotoesAnos();
        if(typeof renderizarIndicadores === 'function') renderizarIndicadores();
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
        var ativ = document.getElementById("selectAtividadeAtribuir") ? document.getElementById("selectAtividadeAtribuir").value : "";
        var selecionados = Array.prototype.map.call(
            document.querySelectorAll('#listaServidoresAtribuirNova .pill-item.selecionado'),
            function(el) { return el.getAttribute('data-value'); }
        );
        var div = document.getElementById("listaAtividadesExistentes"); 
        if (!div) return;
        if (selecionados.length === 0) { 
            div.innerHTML = '<span class="sem-atividades">Selecione um ou mais servidores</span>'; 
            return; 
        } 
        if (!ativ) {
            div.innerHTML = '<span class="sem-atividades">Selecione a atividade</span>';
            return;
        }
        var listaAtual = atribuicoes[ativ] || [];
        var html = "";
        for (var i = 0; i < selecionados.length; i++) {
            var nome = selecionados[i];
            var jaTem = listaAtual.indexOf(nome) !== -1;
            html += `<span class="preview-badge"${jaTem ? ' style="opacity:0.5;"' : ''}>${escapeHtml(nome)}${jaTem ? ' (já tem)' : ''}</span>`;
        }
        div.innerHTML = html;
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

// Mantém a ordem "quem foi atribuído por último" em sincronia com as
// telas, sem precisar recarregar a página inteira.
function registrarOrdemAtribuicao(servidor, atividade) {
    if (!window._ordemAtribuicoesPorServidor) window._ordemAtribuicoesPorServidor = {};
    if (!window._ordemAtribuicoesPorServidor[servidor]) window._ordemAtribuicoesPorServidor[servidor] = [];
    if (window._ordemAtribuicoesPorServidor[servidor].indexOf(atividade) === -1) {
        window._ordemAtribuicoesPorServidor[servidor].push(atividade);
    }
}
function removerOrdemAtribuicao(servidor, atividade) {
    if (window._ordemAtribuicoesPorServidor && window._ordemAtribuicoesPorServidor[servidor]) {
        var idx = window._ordemAtribuicoesPorServidor[servidor].indexOf(atividade);
        if (idx !== -1) window._ordemAtribuicoesPorServidor[servidor].splice(idx, 1);
    }
}

function selecionarServidorAtribuicoes(nome) { 
    try {
        servidorAtualmenteSelecionado = nome; 
        renderizarListaServidoresAtribuicoes(); 
        var ativs;
        if (window._ordemAtribuicoesPorServidor && window._ordemAtribuicoesPorServidor[nome]) {
            ativs = window._ordemAtribuicoesPorServidor[nome].slice();
        } else {
            ativs = [];
            for(var a in atribuicoes) {
                if(atribuicoes[a].indexOf(nome) !== -1) ativs.push(a); 
            }
        }
        var tituloElement = document.getElementById("tituloServidorSelecionado");
        var listaElement = document.getElementById("listaAtividadesServidorSelecionado");
        if(tituloElement) tituloElement.innerHTML = `Atividades de ${escapeHtml(nome)} (Lotação: ${escapeHtml(getLotacaoServidor(nome))}) <button class="btn-acessar-registros" style="margin-left:12px;" onclick="acessarRegistro('${nome.replace(/'/g,"\\'")}')">Ver Registro</button>`;
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
            removerOrdemAtribuicao(serv, ativ);
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
        
        var páginas = {
            'principal': 'index.html',
            'servidores': 'servidores.html',
            'atividades': 'atividades.html',
            'atribuicoes': 'atribuicoes.html',
            'estatistica': 'estatistica.html'
        };

        for(var i = 0; i < tabs.length; i++) {
            tabs[i].onclick = function(e) {
                try {
                    e.preventDefault();
                    var id = this.getAttribute('data-tab');
                    if(páginas[id]) {
                        window.location.href = páginas[id];
                    } else {
                        var texto = this.textContent.trim();
                        if (texto.indexOf('Adicionar') !== -1) window.location.href = 'atividades.html';
                        else if (texto.indexOf('Atribuir') !== -1) window.location.href = 'atribuicoes.html';
                        else if (texto.indexOf('Servidores') !== -1) window.location.href = 'servidores.html';
                        else if (texto.indexOf('Principal') !== -1) window.location.href = 'index.html';
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
            tituloElement.innerText = "\ud83d\udcca An\u00e1lise Detalhada por Atividade - " + ano;
        }
        
        if (!container) {
            console.warn('Container listaAnaliseAtividades n\u00e3o encontrado');
            return;
        }

        container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Carregando...</p>';
        document.getElementById("modalAnaliseAtividade").style.display = "block";

        // 100% Supabase: soma os registros reais dos servidores (para o ano
        // corrente) com o que foi alimentado manualmente em "Dados
        // Estat\u00edsticos" (v\u00e1lido para todos os anos) \u2014 mesma l\u00f3gica j\u00e1
        // usada nos Indicadores Gerais, sem depender mais de localStorage
        // nem de dados fixos no c\u00f3digo.
        buscarAnaliseAtividade(ano, container);
    } catch(e) {
        console.warn('Erro ao abrir modal de an\u00e1lise:', e.message);
        feedback("Erro ao abrir an\u00e1lise detalhada!");
    }
}

async function buscarAnaliseAtividade(ano, container) {
    try {
        var seateTotais = {};
        var nahoraTotais = {};

        if (anoUsaRegistros(ano)) {
            var totaisAnoAtual = await obterTotaisAno(ano);
            for (var ativ in totaisAnoAtual.porAtividadeSeate) { seateTotais[ativ] = (seateTotais[ativ] || 0) + totaisAnoAtual.porAtividadeSeate[ativ]; }
            for (var ativ in totaisAnoAtual.porAtividadeNahora) { nahoraTotais[ativ] = (nahoraTotais[ativ] || 0) + totaisAnoAtual.porAtividadeNahora[ativ]; }
        }
        var manualAno = await obterDadosAno(ano);
        if (manualAno) {
            for (var ativM in (manualAno.SEATE || {})) {
                var totalM = 0;
                for (var mesM in manualAno.SEATE[ativM]) { totalM += manualAno.SEATE[ativM][mesM] || 0; }
                seateTotais[ativM] = (seateTotais[ativM] || 0) + totalM;
            }
            for (var ativM2 in (manualAno.NAHORA || {})) {
                var totalM2 = 0;
                for (var mesM2 in manualAno.NAHORA[ativM2]) { totalM2 += manualAno.NAHORA[ativM2][mesM2] || 0; }
                nahoraTotais[ativM2] = (nahoraTotais[ativM2] || 0) + totalM2;
            }
        }

        var totalSeate = 0, totalNahora = 0;
        for (var ativ in seateTotais) { totalSeate += seateTotais[ativ]; }
        for (var ativ in nahoraTotais) { totalNahora += nahoraTotais[ativ]; }

        if (totalSeate === 0 && totalNahora === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">Nenhum dado encontrado para ' + ano + '</p>';
            return;
        }

        var todasAtividades = {};
        for (var ativ in seateTotais) { todasAtividades[ativ] = { seate: seateTotais[ativ], nahora: nahoraTotais[ativ] || 0 }; }
        for (var ativ in nahoraTotais) {
            if (todasAtividades[ativ]) { todasAtividades[ativ].nahora = nahoraTotais[ativ]; }
            else { todasAtividades[ativ] = { seate: 0, nahora: nahoraTotais[ativ] }; }
        }

        var items = [];
        for (var ativ in todasAtividades) {
            var total = todasAtividades[ativ].seate + todasAtividades[ativ].nahora;
            if (total > 0) { items.push({ nome: ativ, seate: todasAtividades[ativ].seate, nahora: todasAtividades[ativ].nahora, total: total }); }
        }
        items.sort(function(a, b) { return b.total - a.total; });

        var html = '';
        html += '<div class="titulo-secao">\ud83d\udccd ATIVIDADES - ' + ano + '</div>';
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
            html += '<td style="text-align:center; font-weight:600;">' + formatarMilhar(item.seate) + '</td>';
            html += '<td style="text-align:center; font-weight:600;">' + formatarMilhar(item.nahora) + '</td>';
            html += '<td style="text-align:center; font-weight:700; background:var(--cinza-suave);">' + formatarMilhar(item.total) + '</td>';
            html += '</tr>';
        }

        html += '<tr style="font-weight:700; background:var(--cinza-suave);">';
        html += '<td style="text-align:left; color:var(--azul-marinho);">TOTAL GERAL</td>';
        html += '<td style="text-align:center; background:#0F2D52; color:#fff;">' + formatarMilhar(totalSeate) + '</td>';
        html += '<td style="text-align:center; background:#B30000; color:#fff;">' + formatarMilhar(totalNahora) + '</td>';
        html += '<td style="text-align:center; background:var(--destaque); color:var(--azul-marinho);">' + formatarMilhar(totalSeate + totalNahora) + '</td>';
        html += '</tr>';
        html += '</tbody></table></div>';

        container.innerHTML = html;
    } catch(e) {
        console.warn('Erro ao buscar an\u00e1lise de atividade:', e.message);
        container.innerHTML = '<p style="text-align:center; padding:20px; color:#888;">N\u00e3o foi poss\u00edvel carregar a an\u00e1lise. Verifique sua conex\u00e3o e tente novamente.</p>';
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
window.obterTotaisAno = obterTotaisAno;
window.distribuirIndicadores = distribuirIndicadores;
window.atualizarAnoMaximo = atualizarAnoMaximo;
window.anoUsaRegistros = anoUsaRegistros;
window.anoSoRegistros = anoSoRegistros;
window.gerarLink = gerarLink;
window.copiarLink = copiarLink;
window.acessarRegistro = acessarRegistro;
window.toggleBloqueio = toggleBloqueio;
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
