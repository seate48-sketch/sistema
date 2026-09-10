// ============================================================
// CONFIGURAÇÃO CENTRALIZADA DO SUPABASE
// ============================================================
// Este arquivo deve ser carregado ANTES de qualquer script que use Supabase
// Incluir no <head> ou no início do <body> de TODAS as páginas HTML

const SUPABASE_CONFIG = {
    // ========================================
    // CONFIGURAÇÕES PRINCIPAIS
    // ========================================
    
    // URL do projeto Supabase (UNIFICADA - CORRETA)
    URL: 'https://jufkkpqzxywdajuvxgja.supabase.co',
    
    // Chave anônima (pública) do Supabase (UNIFICADA - CORRETA)
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp1ZmtrcHF6eHl3ZGFqdXZ4Z2phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg5NzIwOTUsImV4cCI6MjEwNDU0ODA5NX0.53O3QWW76Ho5EQ4_2yarDpl-nQ7LtCOViUj3a7-ylj8',
    
    // ========================================
    // NOMES DAS TABELAS
    // ========================================
    TABLES: {
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
    },
    
    // ========================================
    // CONFIGURAÇÕES ADICIONAIS
    // ========================================
    OPTIONS: {
        schema: 'public',
        headers: {
            'Content-Type': 'application/json'
        },
        autoRefreshToken: true,
        persistSession: true
    },
    
    // ========================================
    // CONFIGURAÇÕES DE CACHE
    // ========================================
    CACHE: {
        enabled: true,
        duration: 300000 // 5 minutos em milissegundos
    },

    // ========================================
    // DEPURAÇÃO (deixar false em produção)
    // ========================================
    DEBUG: false
};

// ============================================================
// EXPORTAR PARA USO GLOBAL
// ============================================================
window.SUPABASE_CONFIG = SUPABASE_CONFIG;

// ============================================================
// VALIDAÇÃO DE CONFIGURAÇÃO (só quando DEBUG estiver ligado)
// ============================================================
if (SUPABASE_CONFIG.DEBUG) {
    console.log('✅ Configuração Supabase carregada:');
    console.log('📌 URL:', SUPABASE_CONFIG.URL);
    console.log('📌 Tabelas:', Object.keys(SUPABASE_CONFIG.TABLES).join(', '));
    console.log('🔑 ANON_KEY:', SUPABASE_CONFIG.ANON_KEY.substring(0, 30) + '...');
}
