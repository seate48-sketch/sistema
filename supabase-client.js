// supabase-client.js - Cliente e operações de banco para o sistema SEATE
// VERSÃO CORRIGIDA - URL UNIFICADA + UUID FIXO ELIMINADO

// ============================================================
// IMPORTAR CONFIGURAÇÃO CENTRALIZADA
// ============================================================
// Usar a configuração do window.SUPABASE_CONFIG (carregada via config.js)
// Fallback para valores diretos se a config não estiver disponível

const SUPABASE_URL = window.SUPABASE_CONFIG?.URL;
const SUPABASE_ANON_KEY = window.SUPABASE_CONFIG?.ANON_KEY;
const TABLES = window.SUPABASE_CONFIG?.TABLES || {
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

// ============================================================
// LOG DE DEPURAÇÃO (só imprime se SUPABASE_CONFIG.DEBUG === true)
// ============================================================
function logDebug() {
    if (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.DEBUG) {
        console.log.apply(console, arguments);
    }
}

// ============================================================
// CORREÇÃO: Verificação de disponibilidade do Supabase
// ============================================================
let db = null;
let supabaseDisponivel = false;

try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.warn('⚠️ config.js não carregado ou incompleto (SUPABASE_CONFIG.URL/ANON_KEY ausentes). Usando localStorage.');
        supabaseDisponivel = false;
    } else if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        supabaseDisponivel = true;
        logDebug('✅ Supabase cliente inicializado (URL unificada)');
        logDebug('🔗 URL:', SUPABASE_URL);
    } else {
        console.warn('⚠️ Supabase não disponível. Usando localStorage.');
        supabaseDisponivel = false;
        // Exportar funções mock para não quebrar o sistema
        db = {
            from: function() { 
                return { 
                    select: function() { 
                        return { 
                            order: function() { 
                                return { data: null, error: new Error('Supabase indisponível') } 
                            } 
                        } 
                    },
                    delete: function() {
                        return {
                            eq: function() {
                                return {
                                    then: function(callback) { callback({ error: new Error('Supabase indisponível') }); return this; }
                                }
                            }
                        }
                    },
                    insert: function() {
                        return {
                            select: function() {
                                return {
                                    single: function() {
                                        return {
                                            then: function(callback) { callback({ data: null, error: new Error('Supabase indisponível') }); return this; }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    upsert: function() {
                        return {
                            select: function() {
                                return {
                                    single: function() {
                                        return {
                                            then: function(callback) { callback({ data: null, error: new Error('Supabase indisponível') }); return this; }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } 
            }
        };
    }
} catch(e) {
    console.warn('⚠️ Erro ao inicializar Supabase:', e.message);
    supabaseDisponivel = false;
}
// ============================================================
// FIM DA CORREÇÃO
// ============================================================

// Cache local de IDs (evita buscas repetidas ao banco)
const _cache = {
    servidores: {}, // nome → { id, lotacao, bloqueado }
    atividades: {}, // nome → id
    configId: null  // UUID da linha de configuração
};

// ============================================================
// CORREÇÃO: busca robusta de servidor por nome
// ============================================================
// Várias funções abaixo (mensagens, registros, bloqueios) dependiam
// apenas de _cache.servidores já estar carregado por uma chamada
// anterior a dbCarregarServidores(). Se essa chamada ainda não tivesse
// terminado (ela é assíncrona) no momento em que uma dessas funções
// rodava, o "serv" saía undefined e a operação falhava EM SILÊNCIO —
// sem erro visível para quem estava usando o sistema. Esta função
// resolve isso: usa o cache quando já existe, e só busca direto no
// banco (e preenche o cache) se ainda não tinha carregado.
async function obterServidorPorNome(nomeServidor) {
    if (_cache.servidores[nomeServidor]) return _cache.servidores[nomeServidor];
    if (!supabaseDisponivel || !db) return null;
    try {
        const { data, error } = await db.from(TABLES.SERVIDORES)
            .select('id, lotacao, bloqueado').eq('nome', nomeServidor).maybeSingle();
        if (error || !data) return null;
        _cache.servidores[nomeServidor] = { id: data.id, lotacao: data.lotacao, bloqueado: data.bloqueado };
        return _cache.servidores[nomeServidor];
    } catch(e) {
        console.error('❌ Erro em obterServidorPorNome:', e.message);
        return null;
    }
}

// =====================================================
// SERVIDORES
// =====================================================

async function dbCarregarServidores() {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Retornando dados vazios.');
        return { servidores: [], lotacoes: [], bloqueios: {} };
    }
    
    try {
        const { data, error } = await db.from(TABLES.SERVIDORES).select('*').order('ordem');
        if (error) { console.error('dbCarregarServidores:', error); return { servidores: [], lotacoes: [], bloqueios: {} }; }

        _cache.servidores = {};
        data.forEach(s => { _cache.servidores[s.nome] = { id: s.id, lotacao: s.lotacao, bloqueado: s.bloqueado }; });

        return {
            servidores: data.map(s => s.nome),
            lotacoes:   data.map(s => s.lotacao),
            bloqueios:  data.reduce((acc, s) => { acc[s.nome] = s.bloqueado; return acc; }, {})
        };
    } catch(e) {
        console.error('❌ Erro em dbCarregarServidores:', e.message);
        return { servidores: [], lotacoes: [], bloqueios: {} };
    }
}

async function dbSalvarServidores(arrServidores, arrLotacoes, objBloqueios) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando apenas no localStorage.');
        return;
    }
    
    try {
        const { data: dbData, error } = await db.from(TABLES.SERVIDORES).select('id, nome, lotacao, bloqueado');
        if (error) { console.error('dbSalvarServidores fetch:', error); return; }

        const dbMap  = {};
        dbData.forEach(s => { dbMap[s.nome] = s; });

        const memSet  = new Set(arrServidores);
        const toAdd   = arrServidores.filter(n => !dbMap[n]);
        const toDel   = dbData.filter(s => !memSet.has(s.nome));
        const ops     = [];

        // Sem heurística de renomeação: um nome novo é sempre tratado como
        // um servidor novo, e um nome removido é sempre excluído de fato.
        // Renomear um servidor deve ser feito por uma chamada explícita
        // (ex: atualizar pelo id conhecido), nunca adivinhado por coincidência
        // de "1 nome saiu, 1 nome entrou" na mesma sincronização.
        for (const nome of toAdd) {
            const idx     = arrServidores.indexOf(nome);
            const lotacao  = arrLotacoes[idx]  || 'SEATE';
            const bloqueado = objBloqueios[nome] || false;
            ops.push(
                db.from(TABLES.SERVIDORES).insert({ nome, lotacao, bloqueado }).select().single()
                  .then(({ data: d }) => { if (d) _cache.servidores[nome] = { id: d.id, lotacao, bloqueado }; })
            );
        }
        for (const s of toDel) {
            ops.push(db.from(TABLES.SERVIDORES).delete().eq('id', s.id)
              .then(() => { delete _cache.servidores[s.nome]; }));
        }

        // Atualiza registros existentes que mudaram
        for (const nome of arrServidores) {
            if (dbMap[nome]) {
                const idx      = arrServidores.indexOf(nome);
                const lotacao   = arrLotacoes[idx]   || 'SEATE';
                const bloqueado = objBloqueios[nome] || false;
                if (dbMap[nome].lotacao !== lotacao || dbMap[nome].bloqueado !== bloqueado) {
                    ops.push(db.from(TABLES.SERVIDORES).update({ lotacao, bloqueado }).eq('id', dbMap[nome].id));
                }
                _cache.servidores[nome] = { id: dbMap[nome].id, lotacao, bloqueado };
            }
        }

        if (ops.length > 0) await Promise.all(ops);
    } catch(e) {
        console.error('❌ Erro em dbSalvarServidores:', e.message);
    }
}

async function dbSalvarBloqueios(objBloqueios) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando bloqueios apenas no localStorage.');
        return;
    }
    
    try {
        const ops = [];
        for (const [nome, bloqueado] of Object.entries(objBloqueios)) {
            const serv = await obterServidorPorNome(nome);
            if (serv && serv.bloqueado !== !!bloqueado) {
                serv.bloqueado = !!bloqueado;
                ops.push(db.from(TABLES.SERVIDORES).update({ bloqueado: !!bloqueado }).eq('id', serv.id));
            }
        }
        if (ops.length > 0) await Promise.all(ops);
    } catch(e) {
        console.error('❌ Erro em dbSalvarBloqueios:', e.message);
    }
}

async function dbCarregarBloqueioServidor(nome) {
    if (!supabaseDisponivel || !db) return false;
    
    try {
        const { data, error } = await db.from(TABLES.SERVIDORES).select('bloqueado').eq('nome', nome).maybeSingle();
        if (error || !data) return false;
        return data.bloqueado;
    } catch(e) {
        console.error('❌ Erro em dbCarregarBloqueioServidor:', e.message);
        return false;
    }
}

// =====================================================
// ATIVIDADES
// =====================================================

async function dbCarregarAtividades() {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Retornando dados vazios.');
        return [];
    }
    
    try {
        const { data, error } = await db.from(TABLES.ATIVIDADES).select('*').order('nome');
        if (error) { console.error('dbCarregarAtividades:', error); return []; }

        _cache.atividades = {};
        data.forEach(a => { _cache.atividades[a.nome] = a.id; });
        return data.map(a => a.nome);
    } catch(e) {
        console.error('❌ Erro em dbCarregarAtividades:', e.message);
        return [];
    }
}

async function dbSalvarAtividades(arrAtividades) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando atividades apenas no localStorage.');
        return;
    }
    
    try {
        const { data: dbData, error } = await db.from(TABLES.ATIVIDADES).select('id, nome');
        if (error) { console.error('dbSalvarAtividades:', error); return; }

        const dbMap = {};
        dbData.forEach(a => { dbMap[a.nome] = a.id; });

        const memSet = new Set(arrAtividades);
        const toAdd  = arrAtividades.filter(n => !dbMap[n]);
        const toDel  = dbData.filter(a => !memSet.has(a.nome));
        const ops    = [];

        // Heurística de renomeação
        if (toAdd.length === 1 && toDel.length === 1) {
            const old     = toDel[0];
            const newNome = toAdd[0];
            ops.push(
                db.from(TABLES.ATIVIDADES).update({ nome: newNome }).eq('id', old.id)
                  .then(() => { _cache.atividades[newNome] = old.id; delete _cache.atividades[old.nome]; })
            );
        } else {
            for (const nome of toAdd) {
                ops.push(
                    db.from(TABLES.ATIVIDADES).insert({ nome }).select().single()
                      .then(({ data: d }) => { if (d) _cache.atividades[nome] = d.id; })
                );
            }
            for (const a of toDel) {
                ops.push(db.from(TABLES.ATIVIDADES).delete().eq('id', a.id)
                  .then(() => { delete _cache.atividades[a.nome]; }));
            }
        }

        for (const nome of arrAtividades) {
            if (dbMap[nome]) _cache.atividades[nome] = dbMap[nome];
        }

        if (ops.length > 0) await Promise.all(ops);
    } catch(e) {
        console.error('❌ Erro em dbSalvarAtividades:', e.message);
    }
}

// =====================================================
// ATRIBUIÇÕES - CORRIGIDO (UUID FIXO ELIMINADO)
// =====================================================

async function dbCarregarAtribuicoes() {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Retornando dados vazios.');
        return {};
    }
    
    try {
        const { data, error } = await db
            .from(TABLES.ATRIBUICOES)
            .select('servidores(nome), atividades(nome)');
        if (error) { console.error('dbCarregarAtribuicoes:', error); return {}; }

        const result = {};
        data.forEach(row => {
            const ativNome = row.atividades ? row.atividades.nome : null;
            const servNome = row.servidores ? row.servidores.nome : null;
            if (ativNome && servNome) {
                if (!result[ativNome]) result[ativNome] = [];
                result[ativNome].push(servNome);
            }
        });
        return result;
    } catch(e) {
        console.error('❌ Erro em dbCarregarAtribuicoes:', e.message);
        return {};
    }
}

async function dbSalvarAtribuicoes(objAtribuicoes) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando atribuições apenas no localStorage.');
        return;
    }
    
    try {
        // Garantir que o cache nome -> id de servidores/atividades está atualizado
        await dbCarregarServidores();
        await dbCarregarAtividades();
        
        // Buscar o estado atual no banco (por id)
        const { data: existentes, error: selectError } = await db.from(TABLES.ATRIBUICOES).select('servidor_id, atividade_id');
        if (selectError) {
            console.error('dbSalvarAtribuicoes select:', selectError);
            return;
        }
        
        // Montar o conjunto desejado (a partir do objeto recebido, convertido para ids)
        const desejado = new Set();
        for (const [ativNome, servNames] of Object.entries(objAtribuicoes)) {
            const atividadeId = _cache.atividades[ativNome];
            if (!atividadeId) continue;
            for (const servNome of servNames) {
                const servInfo = await obterServidorPorNome(servNome);
                if (!servInfo) continue;
                desejado.add(servInfo.id + '\u241F' + atividadeId);
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
            const { error } = await db.from(TABLES.ATRIBUICOES).insert(paraInserir);
            if (error) console.error('dbSalvarAtribuicoes insert:', error);
            else logDebug('✅ ' + paraInserir.length + ' atribuições inseridas.');
        }
        
        if (paraExcluir.length > 0) {
            const resultados = await Promise.all(paraExcluir.map(p =>
                db.from(TABLES.ATRIBUICOES).delete().eq('servidor_id', p.servidor_id).eq('atividade_id', p.atividade_id)
            ));
            const falhas = resultados.filter(r => r.error);
            if (falhas.length > 0) console.error('dbSalvarAtribuicoes delete: ' + falhas.length + ' falha(s)', falhas[0].error);
            else logDebug('✅ ' + paraExcluir.length + ' atribuições removidas.');
        }
    } catch(e) {
        console.error('❌ Erro em dbSalvarAtribuicoes:', e.message);
    }
}

async function dbCarregarAtividadesServidor(nomeServidor) {
    if (!supabaseDisponivel || !db) return [];
    
    try {
        const { data, error } = await db
            .from(TABLES.ATRIBUICOES)
            .select('atividade')
            .eq('servidor', nomeServidor);
        if (error) return [];
        return data.map(r => r.atividade).filter(Boolean);
    } catch(e) {
        console.error('❌ Erro em dbCarregarAtividadesServidor:', e.message);
        return [];
    }
}

// =====================================================
// REGISTROS DIÁRIOS
// =====================================================

async function dbCarregarRegistros(nomeServidor) {
    if (!supabaseDisponivel || !db) return {};
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) return {};

        const { data, error } = await db
            .from(TABLES.REGISTROS)
            .select('data, atividades, ausencia')
            .eq('servidor_id', serv.id);
        if (error) { console.error('dbCarregarRegistros:', error); return {}; }

        const result = {};
        data.forEach(r => {
            result[r.data] = { atividades: r.atividades || {}, ausencia: r.ausencia || '' };
        });
        return result;
    } catch(e) {
        console.error('❌ Erro em dbCarregarRegistros:', e.message);
        return {};
    }
}

async function dbSalvarRegistroDia(nomeServidor, data, objAtividades, ausencia) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando registro apenas no localStorage.');
        return;
    }
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) { console.error('Cache vazio para:', nomeServidor); return; }

        const { error } = await db.from(TABLES.REGISTROS).upsert({
            servidor_id: serv.id,
            data,
            atividades:  objAtividades || {},
            ausencia:    ausencia || null
        }, { onConflict: 'servidor_id,data' });
        if (error) console.error('dbSalvarRegistroDia:', error);
    } catch(e) {
        console.error('❌ Erro em dbSalvarRegistroDia:', e.message);
    }
}

async function dbExcluirRegistroDia(nomeServidor, data) {
    if (!supabaseDisponivel || !db) return;
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) return;

        const { error } = await db.from(TABLES.REGISTROS)
            .delete()
            .eq('servidor_id', serv.id)
            .eq('data', data);
        if (error) console.error('dbExcluirRegistroDia:', error);
    } catch(e) {
        console.error('❌ Erro em dbExcluirRegistroDia:', e.message);
    }
}

async function dbCarregarTotaisAno(ano) {
    const MESES = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const vazio = { totalGeral: 0, seateTotal: 0, nahoraTotal: 0, porAtividadeSeate: {}, porAtividadeNahora: {}, porMes: {}, porAtividadeMesSeate: {}, porAtividadeMesNahora: {} };
    MESES.forEach(m => { vazio.porMes[m] = 0; });
    if (!supabaseDisponivel || !db) return vazio;

    try {
        const { data, error } = await db
            .from(TABLES.REGISTROS)
            .select('data, atividades, servidores(lotacao)')
            .gte('data', ano + '-01-01')
            .lte('data', ano + '-12-31');
        if (error) { console.error('dbCarregarTotaisAno:', error); return vazio; }

        const resultado = { totalGeral: 0, seateTotal: 0, nahoraTotal: 0, porAtividadeSeate: {}, porAtividadeNahora: {}, porMes: {}, porAtividadeMesSeate: {}, porAtividadeMesNahora: {} };
        MESES.forEach(m => { resultado.porMes[m] = 0; });

        (data || []).forEach(linha => {
            const lot = linha.servidores ? linha.servidores.lotacao : null;
            const atividadesDia = linha.atividades || {};
            const mesNome = MESES[parseInt(linha.data.split('-')[1], 10) - 1];
            const porAtivMes = lot === 'SEATE' ? resultado.porAtividadeMesSeate : (lot === 'NAHORA' ? resultado.porAtividadeMesNahora : null);
            let totalDia = 0;
            for (const ativ in atividadesDia) {
                const valor = atividadesDia[ativ] || 0;
                totalDia += valor;
                if (lot === 'SEATE') resultado.porAtividadeSeate[ativ] = (resultado.porAtividadeSeate[ativ] || 0) + valor;
                else if (lot === 'NAHORA') resultado.porAtividadeNahora[ativ] = (resultado.porAtividadeNahora[ativ] || 0) + valor;
                if (porAtivMes && mesNome) {
                    if (!porAtivMes[ativ]) porAtivMes[ativ] = {};
                    porAtivMes[ativ][mesNome] = (porAtivMes[ativ][mesNome] || 0) + valor;
                }
            }
            resultado.totalGeral += totalDia;
            if (lot === 'SEATE') resultado.seateTotal += totalDia;
            else if (lot === 'NAHORA') resultado.nahoraTotal += totalDia;
            if (mesNome) resultado.porMes[mesNome] += totalDia;
        });

        return resultado;
    } catch(e) {
        console.error('❌ Erro em dbCarregarTotaisAno:', e.message);
        return vazio;
    }
}

// =====================================================
// CONFIGURAÇÃO
// =====================================================

async function dbCarregarConfiguracao() {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Usando configuração padrão.');
        const now = new Date();
        return { mes: now.getMonth(), ano: now.getFullYear(), suspenso: false };
    }
    
    try {
        const { data, error } = await db.from(TABLES.CONFIGURACAO).select('*').limit(1).maybeSingle();
        if (error) console.error('dbCarregarConfiguracao:', error);

        if (data) { _cache.configId = data.id; return data; }

        const now = new Date();
        const { data: nova, error: e2 } = await db.from(TABLES.CONFIGURACAO)
            .insert({ mes: now.getMonth(), ano: now.getFullYear(), suspenso: false })
            .select().single();
        if (e2) { console.error('dbCarregarConfiguracao insert:', e2); return { mes: now.getMonth(), ano: now.getFullYear(), suspenso: false }; }
        _cache.configId = nova.id;
        return nova;
    } catch(e) {
        console.error('❌ Erro em dbCarregarConfiguracao:', e.message);
        const now = new Date();
        return { mes: now.getMonth(), ano: now.getFullYear(), suspenso: false };
    }
}

async function dbSalvarConfiguracao(mes, ano) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando configuração apenas no localStorage.');
        return;
    }
    
    try {
        if (!_cache.configId) await dbCarregarConfiguracao();
        const { error } = await db.from(TABLES.CONFIGURACAO).update({ mes, ano }).eq('id', _cache.configId);
        if (error) console.error('dbSalvarConfiguracao:', error);
    } catch(e) {
        console.error('❌ Erro em dbSalvarConfiguracao:', e.message);
    }
}

async function dbCarregarSuspenso() {
    if (!supabaseDisponivel || !db) return false;
    
    try {
        const { data, error } = await db.from(TABLES.CONFIGURACAO).select('suspenso').limit(1).maybeSingle();
        if (error || !data) return false;
        return data.suspenso;
    } catch(e) {
        console.error('❌ Erro em dbCarregarSuspenso:', e.message);
        return false;
    }
}

async function dbToggleSuspenso(suspenso) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando suspenso apenas no localStorage.');
        return;
    }
    
    try {
        if (!_cache.configId) await dbCarregarConfiguracao();
        const { error } = await db.from(TABLES.CONFIGURACAO).update({ suspenso }).eq('id', _cache.configId);
        if (error) console.error('dbToggleSuspenso:', error);
    } catch(e) {
        console.error('❌ Erro em dbToggleSuspenso:', e.message);
    }
}

// =====================================================
// COMUNICADOS - CORRIGIDO (UUID FIXO ELIMINADO)
// =====================================================

async function dbCarregarComunicados() {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Retornando lista vazia.');
        return [];
    }
    
    try {
        const { data, error } = await db.from(TABLES.COMUNICADOS).select('conteudo').order('ordem');
        if (error) { console.error('dbCarregarComunicados:', error); return []; }
        return data.map(c => c.conteudo);
    } catch(e) {
        console.error('❌ Erro em dbCarregarComunicados:', e.message);
        return [];
    }
}

async function dbSalvarComunicados(listaComunicados) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando comunicados apenas no localStorage.');
        return;
    }
    
    try {
        // ============================================================
        // CORREÇÃO: Deletar todos os comunicados de forma segura
        // ============================================================
        try {
            const { data: existing, error: checkError } = await db.from(TABLES.COMUNICADOS).select('id').limit(1);
            
            if (checkError) {
                console.error('dbSalvarComunicados check:', checkError);
                return;
            }
            
            if (existing && existing.length > 0) {
                const { error: deleteError } = await db.from(TABLES.COMUNICADOS).delete().neq('id', null);
                if (deleteError) {
                    console.error('dbSalvarComunicados delete:', deleteError);
                    return;
                }
                logDebug('✅ Comunicados antigos removidos com sucesso.');
            }
        } catch(e) {
            console.error('❌ Erro ao deletar comunicados antigos:', e.message);
            return;
        }
        // ============================================================
        // FIM DA CORREÇÃO
        // ============================================================
        
        const toInsert = listaComunicados.slice(0, 3).map((conteudo, i) => ({ conteudo, ordem: i }));
        if (toInsert.length > 0) {
            const { error } = await db.from(TABLES.COMUNICADOS).insert(toInsert);
            if (error) {
                console.error('dbSalvarComunicados insert:', error);
            } else {
                logDebug('✅ ' + toInsert.length + ' comunicados salvos com sucesso.');
            }
        }
    } catch(e) {
        console.error('❌ Erro em dbSalvarComunicados:', e.message);
    }
}

// =====================================================
// MENSAGEM EMERGENTE
// =====================================================

async function dbCarregarMensagemEmergente() {
    if (!supabaseDisponivel || !db) return null;
    
    try {
        const { data, error } = await db
            .from(TABLES.MENSAGEM_EMERGENTE)
            .select('*')
            .order('criado_em', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (error) { console.error('dbCarregarMensagemEmergente:', error); return null; }
        return data;
    } catch(e) {
        console.error('❌ Erro em dbCarregarMensagemEmergente:', e.message);
        return null;
    }
}

async function dbEnviarMensagemEmergente(conteudo) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando mensagem emergente apenas no localStorage.');
        return null;
    }
    
    try {
        // Deletar mensagem emergente anterior de forma segura
        try {
            const { data: existing, error: checkError } = await db.from(TABLES.MENSAGEM_EMERGENTE).select('id').limit(1);
            if (checkError) {
                console.error('dbEnviarMensagemEmergente check:', checkError);
            } else if (existing && existing.length > 0) {
                await db.from(TABLES.MENSAGEM_EMERGENTE).delete().neq('id', null);
            }
        } catch(e) {
            console.warn('⚠️ Erro ao deletar mensagem emergente antiga:', e.message);
        }
        
        const { data, error } = await db.from(TABLES.MENSAGEM_EMERGENTE).insert({ conteudo }).select().single();
        if (error) { console.error('dbEnviarMensagemEmergente:', error); return null; }
        return data;
    } catch(e) {
        console.error('❌ Erro em dbEnviarMensagemEmergente:', e.message);
        return null;
    }
}

async function dbServidorViuMensagemEmergente(mensagemId, nomeServidor) {
    if (!supabaseDisponivel || !db) return false;
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) return false;
        const { data } = await db.from(TABLES.MENSAGEM_EMERGENTE_VISTAS)
            .select('id').eq('mensagem_id', mensagemId).eq('servidor_id', serv.id).maybeSingle();
        return !!data;
    } catch(e) {
        console.error('❌ Erro em dbServidorViuMensagemEmergente:', e.message);
        return false;
    }
}

async function dbMarcarMensagemEmergenteVista(mensagemId, nomeServidor) {
    if (!supabaseDisponivel || !db) return;
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) return;
        await db.from(TABLES.MENSAGEM_EMERGENTE_VISTAS).upsert(
            { mensagem_id: mensagemId, servidor_id: serv.id },
            { onConflict: 'mensagem_id,servidor_id' }
        );
    } catch(e) {
        console.error('❌ Erro em dbMarcarMensagemEmergenteVista:', e.message);
    }
}

// =====================================================
// MENSAGENS INDIVIDUAIS
// =====================================================

async function dbCarregarMensagemIndividual(nomeServidor) {
    if (!supabaseDisponivel || !db) return null;
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) return null;
        const { data, error } = await db.from(TABLES.MENSAGENS_INDIVIDUAIS)
            .select('*').eq('servidor_id', serv.id).maybeSingle();
        if (error) { console.error('dbCarregarMensagemIndividual:', error); return null; }
        return data;
    } catch(e) {
        console.error('❌ Erro em dbCarregarMensagemIndividual:', e.message);
        return null;
    }
}

async function dbEnviarMensagemIndividual(nomeServidor, conteudo) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando mensagem individual apenas no localStorage.');
        return null;
    }
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) { console.error('Servidor não encontrado no cache:', nomeServidor); return null; }

        // Deletar mensagem individual anterior de forma segura
        try {
            const { data: existing, error: checkError } = await db.from(TABLES.MENSAGENS_INDIVIDUAIS)
                .select('id').eq('servidor_id', serv.id).limit(1);
            if (checkError) {
                console.error('dbEnviarMensagemIndividual check:', checkError);
            } else if (existing && existing.length > 0) {
                await db.from(TABLES.MENSAGENS_INDIVIDUAIS).delete().eq('servidor_id', serv.id);
            }
        } catch(e) {
            console.warn('⚠️ Erro ao deletar mensagem individual antiga:', e.message);
        }

        const { data, error } = await db.from(TABLES.MENSAGENS_INDIVIDUAIS)
            .insert({ servidor_id: serv.id, conteudo }).select().single();
        if (error) { console.error('dbEnviarMensagemIndividual:', error); return null; }
        return data;
    } catch(e) {
        console.error('❌ Erro em dbEnviarMensagemIndividual:', e.message);
        return null;
    }
}

async function dbServidorViuMensagemIndividual(mensagemId, nomeServidor) {
    if (!supabaseDisponivel || !db) return false;
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) return false;
        const { data } = await db.from(TABLES.MENSAGENS_INDIVIDUAIS_VISTAS)
            .select('id').eq('mensagem_id', mensagemId).eq('servidor_id', serv.id).maybeSingle();
        return !!data;
    } catch(e) {
        console.error('❌ Erro em dbServidorViuMensagemIndividual:', e.message);
        return false;
    }
}

async function dbMarcarMensagemIndividualVista(mensagemId, nomeServidor) {
    if (!supabaseDisponivel || !db) return;
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) return;
        await db.from(TABLES.MENSAGENS_INDIVIDUAIS_VISTAS).upsert(
            { mensagem_id: mensagemId, servidor_id: serv.id },
            { onConflict: 'mensagem_id,servidor_id' }
        );
    } catch(e) {
        console.error('❌ Erro em dbMarcarMensagemIndividualVista:', e.message);
    }
}

async function dbExcluirMensagemEmergente() {
    if (!supabaseDisponivel || !db) return;
    try {
        const { error } = await db.from(TABLES.MENSAGEM_EMERGENTE).delete().neq('id', null);
        if (error) console.error('dbExcluirMensagemEmergente:', error);
    } catch(e) {
        console.error('❌ Erro em dbExcluirMensagemEmergente:', e.message);
    }
}

async function dbExcluirMensagemIndividual(nomeServidor) {
    if (!supabaseDisponivel || !db) return false;
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) { console.error('dbExcluirMensagemIndividual: servidor não encontrado:', nomeServidor); return false; }
        const { error } = await db.from(TABLES.MENSAGENS_INDIVIDUAIS).delete().eq('servidor_id', serv.id);
        if (error) { console.error('dbExcluirMensagemIndividual:', error); return false; }
        return true;
    } catch(e) {
        console.error('❌ Erro em dbExcluirMensagemIndividual:', e.message);
        return false;
    }
}

// =====================================================
// DADOS HISTÓRICOS EDITÁVEIS (hoje só usado para 2024)
// =====================================================
async function dbCarregarDados2024() {
    const meses = ["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const vazio = { SEATE: {}, NAHORA: {} };
    if (!supabaseDisponivel || !db) return vazio;

    try {
        const { data, error } = await db.from(TABLES.DADOS_HISTORICOS).select('setor, atividade, mes, valor').eq('ano', '2024');
        if (error) { console.error('dbCarregarDados2024:', error); return vazio; }

        const resultado = { SEATE: {}, NAHORA: {} };
        (data || []).forEach(linha => {
            const setor = resultado[linha.setor];
            if (!setor) return;
            if (!setor[linha.atividade]) {
                setor[linha.atividade] = {};
                meses.forEach(m => { setor[linha.atividade][m] = 0; });
            }
            setor[linha.atividade][linha.mes] = linha.valor;
        });
        return resultado;
    } catch(e) {
        console.error('❌ Erro em dbCarregarDados2024:', e.message);
        return vazio;
    }
}

async function dbSalvarDados2024(dadosSeate, dadosNahora) {
    if (!supabaseDisponivel || !db) return;
    try {
        const linhas = [];
        const montar = (setor, dados) => {
            for (const ativ in dados) {
                for (const mes in dados[ativ]) {
                    linhas.push({ ano: '2024', setor: setor, atividade: ativ, mes: mes, valor: dados[ativ][mes] || 0 });
                }
            }
        };
        montar('SEATE', dadosSeate);
        montar('NAHORA', dadosNahora);

        if (linhas.length === 0) return;
        const { error } = await db.from(TABLES.DADOS_HISTORICOS).upsert(linhas, { onConflict: 'ano,setor,atividade,mes' });
        if (error) console.error('dbSalvarDados2024:', error);
        else logDebug('✅ Dados de 2024 salvos (' + linhas.length + ' registros).');
    } catch(e) {
        console.error('❌ Erro em dbSalvarDados2024:', e.message);
    }
}

// =====================================================
// OBSERVAÇÕES DOS SERVIDORES
// =====================================================

async function dbCarregarObsServidor(nomeServidor, mes, ano) {
    if (!supabaseDisponivel || !db) return '';
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) return '';
        const { data } = await db.from(TABLES.OBS_SERVIDORES)
            .select('observacao')
            .eq('servidor_id', serv.id).eq('mes', mes).eq('ano', ano)
            .maybeSingle();
        return data?.observacao || '';
    } catch(e) {
        console.error('❌ Erro em dbCarregarObsServidor:', e.message);
        return '';
    }
}

async function dbSalvarObsServidor(nomeServidor, mes, ano, observacao) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando observação apenas no localStorage.');
        return;
    }
    
    try {
        const serv = await obterServidorPorNome(nomeServidor);
        if (!serv) return;
        const { error } = await db.from(TABLES.OBS_SERVIDORES).upsert(
            { servidor_id: serv.id, mes, ano, observacao: observacao || '' },
            { onConflict: 'servidor_id,mes,ano' }
        );
        if (error) console.error('dbSalvarObsServidor:', error);
    } catch(e) {
        console.error('❌ Erro em dbSalvarObsServidor:', e.message);
    }
}

// =====================================================
// LISTA DE VISUALIZAÇÃO - CORRIGIDO (UUID FIXO ELIMINADO)
// =====================================================

async function dbCarregarListaVisualizacao() {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Retornando lista vazia.');
        return [];
    }
    
    try {
        const { data, error } = await db
            .from(TABLES.LISTA_VISUALIZACAO)
            .select('servidor:servidores(nome)')
            .order('adicionado_em');
        if (error) { console.error('dbCarregarListaVisualizacao:', error); return []; }
        return data.map(r => r.servidor?.nome).filter(Boolean);
    } catch(e) {
        console.error('❌ Erro em dbCarregarListaVisualizacao:', e.message);
        return [];
    }
}

async function dbSalvarListaVisualizacao(lista) {
    if (!supabaseDisponivel || !db) {
        console.warn('⚠️ Supabase indisponível. Salvando lista de visualização apenas no localStorage.');
        return;
    }
    
    try {
        // ============================================================
        // CORREÇÃO: Deletar toda a lista de visualização de forma segura
        // ============================================================
        try {
            const { data: existing, error: checkError } = await db.from(TABLES.LISTA_VISUALIZACAO).select('id').limit(1);
            
            if (checkError) {
                console.error('dbSalvarListaVisualizacao check:', checkError);
                return;
            }
            
            if (existing && existing.length > 0) {
                const { error: deleteError } = await db.from(TABLES.LISTA_VISUALIZACAO).delete().neq('id', null);
                if (deleteError) {
                    console.error('dbSalvarListaVisualizacao delete:', deleteError);
                    return;
                }
                logDebug('✅ Lista de visualização antiga removida com sucesso.');
            }
        } catch(e) {
            console.error('❌ Erro ao deletar lista de visualização antiga:', e.message);
            return;
        }
        // ============================================================
        // FIM DA CORREÇÃO
        // ============================================================
        
        const toInsertRaw = await Promise.all(lista.map(async nome => {
            const s = await obterServidorPorNome(nome);
            return s ? { servidor_id: s.id } : null;
        }));
        const toInsert = toInsertRaw.filter(Boolean);
        if (toInsert.length > 0) {
            const { error } = await db.from(TABLES.LISTA_VISUALIZACAO).insert(toInsert);
            if (error) {
                console.error('dbSalvarListaVisualizacao insert:', error);
            } else {
                logDebug('✅ ' + toInsert.length + ' itens da lista de visualização salvos com sucesso.');
            }
        }
    } catch(e) {
        console.error('❌ Erro em dbSalvarListaVisualizacao:', e.message);
    }
}

// =====================================================
// CACHE DE PREENCHIMENTO (para o dashboard)
// =====================================================

async function dbCarregarPreenchimento(arrServidores, mesConfig, anoConfig) {
    if (!supabaseDisponivel || !db) return {};
    
    try {
        const mesStr = String(mesConfig + 1).padStart(2, '0');
        const fimDia = new Date(anoConfig, mesConfig + 1, 0).getDate();
        const inicio = `${anoConfig}-${mesStr}-01`;
        const fim    = `${anoConfig}-${mesStr}-${String(fimDia).padStart(2, '0')}`;

        const servIdsRaw = await Promise.all(arrServidores.map(async n => (await obterServidorPorNome(n))?.id));
        const servIds = servIdsRaw.filter(Boolean);
        if (servIds.length === 0) return {};

        const { data } = await db.from(TABLES.REGISTROS)
            .select('servidor_id')
            .in('servidor_id', servIds)
            .gte('data', inicio)
            .lte('data', fim);

        if (!data) return {};
        const preenchidos = new Set(data.map(r => r.servidor_id));
        const result = {};
        for (const nome of arrServidores) {
            const s = await obterServidorPorNome(nome);
            if (s) result[nome] = preenchidos.has(s.id);
        }
        return result;
    } catch(e) {
        console.error('❌ Erro em dbCarregarPreenchimento:', e.message);
        return {};
    }
}

// ============================================================
// EXPORTAÇÃO DAS FUNÇÕES
// ============================================================
logDebug('✅ supabase-client.js carregado com sucesso! (URL unificada + UUID fixo eliminado)');
logDebug('🔗 Conectando ao:', SUPABASE_URL);
