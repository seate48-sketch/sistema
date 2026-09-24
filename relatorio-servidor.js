// ============================================================
// SEATE - Relatório Individual do Servidor
// ============================================================
// Botão "Relatório" na tabela "Status dos Servidores / Colaboradores"
// (index.html). O gestor escolhe um mês/ano ou o ano inteiro e o
// sistema monta, a partir de TODOS os lançamentos do servidor no banco:
//   - Mês: lista dia a dia (atividade, quantidade, total do dia),
//          total por atividade e total geral do mês.
//   - Ano: tabela atividades x meses, com totais por linha e coluna.
// Exporta para Excel (CSV), PDF (html2pdf, a mesma ferramenta da página
// Estatística) ou impressão. Blocos (dia, linha, tabela pequena) nunca
// são cortados entre páginas.
//
// Depende de funções já existentes: dbCarregarRegistros (supabase-client.js),
// getLotacaoServidor, escapeHtml e feedback (common.js).
// ============================================================

(function () {
    'use strict';

    var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    var DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    var HTML2PDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

    // Estado do relatório aberto no momento
    var estado = { nome: '', lotacao: '', registros: null, modelo: null };

    // ---------------- utilitários ----------------
    function esc(t) {
        if (typeof escapeHtml === 'function') return escapeHtml(t);
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function avisar(msg) { if (typeof feedback === 'function') feedback(msg); else alert(msg); }
    function num(n) { return Number(n || 0).toLocaleString('pt-BR'); }
    function pad2(n) { return String(n).padStart(2, '0'); }
    function dataBR(iso) { var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
    function diaSemana(iso) { var p = iso.split('-'); return DIAS_SEMANA[new Date(+p[0], +p[1] - 1, +p[2]).getDay()]; }
    function ordenarPt(a, b) { return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }); }
    function nomeArquivo(t) {
        return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    }
    function agora() {
        var d = new Date();
        return pad2(d.getDate()) + '/' + pad2(d.getMonth() + 1) + '/' + d.getFullYear() + ' às ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    function lotacaoDe(nome) {
        try { if (typeof getLotacaoServidor === 'function') return getLotacaoServidor(nome) || ''; } catch (e) {}
        return '';
    }

    // ---------------- estilos (tela, PDF e impressão) ----------------
    var CSS_RELATORIO = [
        '.rel-doc{font-family:"Segoe UI",Roboto,Arial,sans-serif;color:#1F2937;font-size:11px;line-height:1.35;background:#fff;}',
        '.rel-doc *{box-sizing:border-box;}',
        '.rel-cab{border-bottom:1.5px solid #1F4E79;padding-bottom:8px;margin-bottom:12px;}',
        '.rel-cab-topo{display:flex;justify-content:space-between;align-items:baseline;gap:12px;}',
        '.rel-titulo{font-size:14px;font-weight:600;color:#0F2D52;margin:0;}',
        '.rel-orgao{font-size:9.5px;color:#6B7280;text-align:right;}',
        '.rel-info{display:grid;grid-template-columns:2fr 1fr 1.2fr;gap:4px 16px;margin-top:8px;}',
        '.rel-info div{font-size:11px;}',
        '.rel-info span{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.04em;color:#6B7280;}',
        '.rel-secao{font-size:11.5px;font-weight:600;color:#0F2D52;margin:14px 0 6px;}',
        '.rel-tab{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5px;}',
        '.rel-tab th{background:#F3F4F6;color:#374151;font-weight:600;border:1px solid #D1D5DB;padding:4px 6px;text-align:left;}',
        '.rel-tab td{border:1px solid #E5E7EB;padding:3px 6px;vertical-align:top;word-wrap:break-word;}',
        '.rel-tab .n{text-align:right;white-space:nowrap;}',
        '.rel-tab .c{text-align:center;}',
        '.rel-tab tbody.rel-dia tr:first-child td{border-top:1px solid #D1D5DB;}',
        '.rel-tab .rel-sutil{color:#9CA3AF;}',
        '.rel-tab .rel-aus{color:#6B7280;font-style:italic;}',
        '.rel-tab tr.rel-total td{font-weight:600;background:#F9FAFB;border-top:1.5px solid #9CA3AF;color:#0F2D52;}',
        '.rel-tab.rel-anual{font-size:9.5px;}',
        '.rel-tab.rel-anual th,.rel-tab.rel-anual td{padding:3px 4px;}',
        '.rel-tab.rel-anual td.z{color:#C4C8CE;}',
        '.rel-resumo{display:flex;gap:24px;margin-top:10px;padding:6px 8px;border:1px solid #E5E7EB;background:#F9FAFB;font-size:10.5px;}',
        '.rel-resumo b{color:#0F2D52;}',
        '.rel-vazio{padding:18px;text-align:center;color:#6B7280;border:1px dashed #D1D5DB;}',
        '.rel-rodape{margin-top:14px;padding-top:6px;border-top:1px solid #E5E7EB;font-size:8.5px;color:#9CA3AF;display:flex;justify-content:space-between;}',
        // nunca quebrar estes blocos entre páginas
        '.rel-doc tr,.rel-doc tbody.rel-dia,.rel-bloco,.rel-cab,.rel-resumo{break-inside:avoid;page-break-inside:avoid;}',
        '.rel-secao{break-after:avoid;page-break-after:avoid;}',
        '.rel-doc thead{display:table-header-group;}',
        '.rel-doc tr:hover{background:none;}'
    ].join('\n');

    var CSS_TELA = [
        '.btn-relatorio{background:transparent;border:1px solid var(--azul-institucional);border-radius:20px;padding:4px 14px;color:#000;font-weight:600;font-size:.7rem;cursor:pointer;transition:.2s;margin:0 4px;white-space:nowrap;}',
        '.btn-relatorio:hover{background:var(--azul-institucional);color:var(--branco);}',
        '@media (max-width:768px){.acoes-cell .btn-relatorio{padding:3px 8px;font-size:.6rem;}}',
        '.rel-modal{display:none;position:fixed;z-index:1000;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);overflow-y:auto;padding:24px 12px;}',
        '.rel-modal-box{background:#fff;margin:0 auto;max-width:460px;border-radius:18px;overflow:hidden;animation:slideDown .25s;}',
        '.rel-modal-box.rel-largo{max-width:980px;}',
        '.rel-modal-head{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:var(--azul-marinho);color:#fff;}',
        '.rel-modal-head h3{font-size:1rem;margin:0;font-weight:600;}',
        '.rel-modal-head .rel-x{font-size:26px;cursor:pointer;line-height:1;}',
        '.rel-modal-body{padding:18px 20px;}',
        '.rel-opcoes{display:flex;gap:18px;margin-bottom:14px;font-size:.9rem;}',
        '.rel-opcoes label{display:flex;align-items:center;gap:6px;cursor:pointer;}',
        '.rel-campos{display:flex;gap:12px;flex-wrap:wrap;}',
        '.rel-campos .form-group{flex:1;min-width:130px;}',
        '.rel-campos select{width:100%;}',
        '.rel-modal-foot{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;padding:12px 20px;border-top:1px solid var(--cinza-borda);}',
        '.rel-previa{border:1px solid var(--cinza-borda);border-radius:10px;padding:22px 26px;max-height:62vh;overflow:auto;background:#fff;}',
        '.rel-carregando{padding:14px;text-align:center;color:#6B7280;font-size:.85rem;}'
    ].join('\n');

    function injetarEstilos() {
        if (document.getElementById('estilos-relatorio-servidor')) return;
        var st = document.createElement('style');
        st.id = 'estilos-relatorio-servidor';
        st.textContent = CSS_TELA + '\n' + CSS_RELATORIO;
        document.head.appendChild(st);
    }

    // ---------------- modais ----------------
    function criarModais() {
        if (document.getElementById('relModalPeriodo')) return;
        var wrap = document.createElement('div');
        wrap.innerHTML =
            '<div id="relModalPeriodo" class="rel-modal"><div class="rel-modal-box">' +
                '<div class="rel-modal-head"><h3 id="relTituloPeriodo">Relatório</h3><span class="rel-x" data-rel-fechar="relModalPeriodo">&times;</span></div>' +
                '<div class="rel-modal-body">' +
                    '<div class="rel-opcoes">' +
                        '<label><input type="radio" name="relTipo" value="mes" checked> Mês</label>' +
                        '<label><input type="radio" name="relTipo" value="ano"> Ano inteiro</label>' +
                    '</div>' +
                    '<div class="rel-campos">' +
                        '<div class="form-group" id="relGrupoMes"><label>Mês</label><select id="relMes"></select></div>' +
                        '<div class="form-group"><label>Ano</label><select id="relAno"></select></div>' +
                    '</div>' +
                    '<div id="relStatusCarga" class="rel-carregando" style="display:none;"></div>' +
                '</div>' +
                '<div class="rel-modal-foot">' +
                    '<button class="btn btn-neutral" data-rel-fechar="relModalPeriodo">Cancelar</button>' +
                    '<button class="btn btn-primary" id="relBtnGerar">Gerar relatório</button>' +
                '</div>' +
            '</div></div>' +
            '<div id="relModalPrevia" class="rel-modal"><div class="rel-modal-box rel-largo">' +
                '<div class="rel-modal-head"><h3>Relatório do servidor</h3><span class="rel-x" data-rel-fechar="relModalPrevia">&times;</span></div>' +
                '<div class="rel-modal-body"><div id="relPrevia" class="rel-previa"></div></div>' +
                '<div class="rel-modal-foot">' +
                    '<button class="btn btn-neutral" id="relBtnVoltar">Alterar período</button>' +
                    '<button class="btn btn-neutral" id="relBtnCsv">Excel (CSV)</button>' +
                    '<button class="btn btn-neutral" id="relBtnImprimir">Imprimir</button>' +
                    '<button class="btn btn-primary" id="relBtnPdf">Gerar PDF</button>' +
                '</div>' +
            '</div></div>';
        while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

        var selMes = document.getElementById('relMes');
        selMes.innerHTML = MESES.map(function (m, i) { return '<option value="' + i + '">' + m + '</option>'; }).join('');

        document.querySelectorAll('[data-rel-fechar]').forEach(function (el) {
            el.addEventListener('click', function () { fechar(el.getAttribute('data-rel-fechar')); });
        });
        document.querySelectorAll('input[name="relTipo"]').forEach(function (r) {
            r.addEventListener('change', function () {
                document.getElementById('relGrupoMes').style.display = tipoSelecionado() === 'mes' ? '' : 'none';
            });
        });
        document.getElementById('relBtnGerar').addEventListener('click', gerar);
        document.getElementById('relBtnVoltar').addEventListener('click', function () { fechar('relModalPrevia'); abrir('relModalPeriodo'); });
        document.getElementById('relBtnCsv').addEventListener('click', exportarCSV);
        document.getElementById('relBtnImprimir').addEventListener('click', imprimir);
        document.getElementById('relBtnPdf').addEventListener('click', gerarPDF);
    }

    function abrir(id) { document.getElementById(id).style.display = 'block'; }
    function fechar(id) { document.getElementById(id).style.display = 'none'; }
    function tipoSelecionado() {
        var r = document.querySelector('input[name="relTipo"]:checked');
        return r ? r.value : 'mes';
    }

    // ---------------- abertura ----------------
    async function abrirRelatorioServidor(nome) {
        injetarEstilos();
        criarModais();
        estado = { nome: nome, lotacao: lotacaoDe(nome), registros: null, modelo: null };
        document.getElementById('relTituloPeriodo').textContent = 'Relatório — ' + nome;

        var hoje = new Date();
        var selAno = document.getElementById('relAno');
        var selMes = document.getElementById('relMes');
        var status = document.getElementById('relStatusCarga');
        var btnGerar = document.getElementById('relBtnGerar');
        selAno.innerHTML = '<option value="' + hoje.getFullYear() + '">' + hoje.getFullYear() + '</option>';
        selMes.value = String(hoje.getMonth());
        status.style.display = 'block';
        status.textContent = 'Carregando lançamentos...';
        btnGerar.disabled = true;
        abrir('relModalPeriodo');

        var regs = null;
        try { regs = (typeof dbCarregarRegistros === 'function') ? await dbCarregarRegistros(nome) : null; }
        catch (e) { console.error('Relatório: erro ao carregar registros', e); }

        if (estado.nome !== nome) return; // o gestor abriu outro servidor nesse meio tempo
        if (!regs) {
            status.textContent = 'Não foi possível carregar os lançamentos deste servidor. Verifique a conexão e tente novamente.';
            return;
        }
        estado.registros = regs;

        // anos: todos em que há lançamentos, mais o ano atual
        var anos = {};
        anos[hoje.getFullYear()] = true;
        Object.keys(regs).forEach(function (d) { anos[d.slice(0, 4)] = true; });
        var lista = Object.keys(anos).sort().reverse();
        selAno.innerHTML = lista.map(function (a) { return '<option value="' + a + '">' + a + '</option>'; }).join('');
        selAno.value = String(hoje.getFullYear());

        var qtd = Object.keys(regs).length;
        status.textContent = qtd ? '' : 'Este servidor ainda não tem lançamentos registrados.';
        status.style.display = qtd ? 'none' : 'block';
        btnGerar.disabled = false;
    }

    // ---------------- montagem dos dados ----------------
    function itensDoDia(reg) {
        var itens = [];
        var ativs = (reg && reg.atividades) || {};
        Object.keys(ativs).forEach(function (a) {
            var q = +ativs[a] || 0;
            if (q > 0) itens.push({ ativ: a, qtd: q });
        });
        itens.sort(function (x, y) { return ordenarPt(x.ativ, y.ativ); });
        return itens;
    }

    function montarMensal(regs, ano, mes) {
        var prefixo = ano + '-' + pad2(mes + 1) + '-';
        var datas = Object.keys(regs).filter(function (d) { return d.indexOf(prefixo) === 0; }).sort();
        var dias = [], porAtiv = {}, total = 0, diasComAtividade = 0;
        datas.forEach(function (d) {
            var reg = regs[d];
            var itens = itensDoDia(reg);
            var aus = (reg && reg.ausencia) || '';
            if (!itens.length && !aus) return;
            var tDia = 0;
            itens.forEach(function (it) { tDia += it.qtd; porAtiv[it.ativ] = (porAtiv[it.ativ] || 0) + it.qtd; });
            if (itens.length) diasComAtividade++;
            total += tDia;
            dias.push({ data: d, semana: diaSemana(d), ausencia: aus, itens: itens, total: tDia });
        });
        var resumo = Object.keys(porAtiv).sort(ordenarPt).map(function (a) { return { ativ: a, qtd: porAtiv[a] }; });
        return {
            tipo: 'mes', ano: ano, mes: mes,
            periodo: MESES[mes] + ' de ' + ano,
            dias: dias, resumo: resumo, total: total, diasComAtividade: diasComAtividade
        };
    }

    function montarAnual(regs, ano) {
        var prefixo = ano + '-';
        var matriz = {}, totMes = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total = 0, dias = {};
        Object.keys(regs).forEach(function (d) {
            if (d.indexOf(prefixo) !== 0) return;
            var m = parseInt(d.slice(5, 7), 10) - 1;
            itensDoDia(regs[d]).forEach(function (it) {
                if (!matriz[it.ativ]) matriz[it.ativ] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                matriz[it.ativ][m] += it.qtd;
                totMes[m] += it.qtd;
                total += it.qtd;
                dias[d] = true;
            });
        });
        var linhas = Object.keys(matriz).sort(ordenarPt).map(function (a) {
            return { ativ: a, meses: matriz[a], total: matriz[a].reduce(function (s, v) { return s + v; }, 0) };
        });
        return {
            tipo: 'ano', ano: ano,
            periodo: 'Ano de ' + ano,
            linhas: linhas, totMes: totMes, total: total, diasComAtividade: Object.keys(dias).length
        };
    }

    // ---------------- HTML do relatório ----------------
    function htmlCabecalho(m) {
        return '<div class="rel-cab">' +
            '<div class="rel-cab-topo"><h2 class="rel-titulo">Relatório Individual de Atividades</h2>' +
            '<div class="rel-orgao">SEATE · Justiça Federal – SJDF</div></div>' +
            '<div class="rel-info">' +
                '<div><span>Servidor / Colaborador</span>' + esc(estado.nome) + '</div>' +
                '<div><span>Lotação</span>' + esc(estado.lotacao || '—') + '</div>' +
                '<div><span>Período</span>' + esc(m.periodo) + '</div>' +
            '</div></div>';
    }

    function htmlRodape() {
        return '<div class="rel-rodape"><span>SEATE – Sistema de Gestão de Atividades</span><span>Gerado em ' + agora() + '</span></div>';
    }

    function htmlResumoGeral(m) {
        return '<div class="rel-resumo">' +
            '<div>Dias com atividade: <b>' + num(m.diasComAtividade) + '</b></div>' +
            '<div>Total geral do período: <b>' + num(m.total) + '</b></div>' +
        '</div>';
    }

    function htmlMensal(m) {
        var h = htmlCabecalho(m);
        if (!m.dias.length) {
            return h + '<div class="rel-vazio">Nenhum lançamento registrado em ' + esc(m.periodo) + '.</div>' + htmlRodape();
        }
        h += '<div class="rel-secao">Lançamentos dia a dia</div>';
        h += '<table class="rel-tab"><colgroup><col style="width:13%"><col style="width:12%"><col><col style="width:11%"><col style="width:13%"></colgroup>' +
             '<thead><tr><th>Data</th><th>Dia</th><th>Atividade</th><th class="n">Quantidade</th><th class="n">Total do dia</th></tr></thead>';
        m.dias.forEach(function (d) {
            h += '<tbody class="rel-dia">';
            if (!d.itens.length) {
                h += '<tr><td>' + dataBR(d.data) + '</td><td>' + d.semana + '</td><td class="rel-aus">' + esc(d.ausencia) + '</td><td class="n rel-sutil">—</td><td class="n rel-sutil">0</td></tr>';
            } else {
                d.itens.forEach(function (it, i) {
                    var primeira = i === 0;
                    h += '<tr>' +
                        '<td>' + (primeira ? dataBR(d.data) : '') + '</td>' +
                        '<td>' + (primeira ? d.semana : '') + '</td>' +
                        '<td>' + esc(it.ativ) + '</td>' +
                        '<td class="n">' + num(it.qtd) + '</td>' +
                        '<td class="n">' + (primeira ? '<b>' + num(d.total) + '</b>' + (d.ausencia ? '<div class="rel-aus">' + esc(d.ausencia) + '</div>' : '') : '') + '</td>' +
                    '</tr>';
                });
            }
            h += '</tbody>';
        });
        h += '</table>';

        h += '<div class="rel-bloco"><div class="rel-secao">Total por atividade no mês</div>';
        h += '<table class="rel-tab"><colgroup><col><col style="width:14%"><col style="width:12%"></colgroup>' +
             '<thead><tr><th>Atividade</th><th class="n">Quantidade</th><th class="n">% do total</th></tr></thead><tbody>';
        m.resumo.forEach(function (r) {
            var pct = m.total ? (r.qtd * 100 / m.total) : 0;
            h += '<tr><td>' + esc(r.ativ) + '</td><td class="n">' + num(r.qtd) + '</td><td class="n">' + pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%</td></tr>';
        });
        h += '<tr class="rel-total"><td>TOTAL GERAL</td><td class="n">' + num(m.total) + '</td><td class="n">100,0%</td></tr>';
        h += '</tbody></table>';
        h += htmlResumoGeral(m) + '</div>' + htmlRodape();
        return h;
    }

    function htmlAnual(m) {
        var h = htmlCabecalho(m);
        if (!m.linhas.length) {
            return h + '<div class="rel-vazio">Nenhum lançamento registrado no ano de ' + m.ano + '.</div>' + htmlRodape();
        }
        h += '<div class="rel-bloco"><div class="rel-secao">Atividades por mês</div>';
        h += '<table class="rel-tab rel-anual"><colgroup><col style="width:25%">';
        for (var i = 0; i < 12; i++) h += '<col>';
        h += '<col style="width:7%"></colgroup><thead><tr><th>Atividade</th>';
        MESES_ABREV.forEach(function (mm) { h += '<th class="c">' + mm + '</th>'; });
        h += '<th class="n">Total</th></tr></thead><tbody>';
        m.linhas.forEach(function (l) {
            h += '<tr><td>' + esc(l.ativ) + '</td>';
            l.meses.forEach(function (v) { h += '<td class="c' + (v ? '' : ' z') + '">' + (v ? num(v) : '–') + '</td>'; });
            h += '<td class="n"><b>' + num(l.total) + '</b></td></tr>';
        });
        h += '<tr class="rel-total"><td>TOTAL GERAL</td>';
        m.totMes.forEach(function (v) { h += '<td class="c">' + num(v) + '</td>'; });
        h += '<td class="n">' + num(m.total) + '</td></tr>';
        h += '</tbody></table>';
        h += htmlResumoGeral(m) + '</div>' + htmlRodape();
        return h;
    }

    function htmlRelatorio(m) {
        return '<div class="rel-doc">' + (m.tipo === 'mes' ? htmlMensal(m) : htmlAnual(m)) + '</div>';
    }

    // ---------------- gerar / pré-visualizar ----------------
    function gerar() {
        if (!estado.registros) { avisar('Aguarde o carregamento dos lançamentos.'); return; }
        var ano = document.getElementById('relAno').value;
        var mes = parseInt(document.getElementById('relMes').value, 10);
        estado.modelo = tipoSelecionado() === 'mes' ? montarMensal(estado.registros, ano, mes) : montarAnual(estado.registros, ano);
        document.getElementById('relPrevia').innerHTML = htmlRelatorio(estado.modelo);
        fechar('relModalPeriodo');
        abrir('relModalPrevia');
    }

    function sufixoArquivo() {
        var m = estado.modelo;
        var per = m.tipo === 'mes' ? (m.ano + '_' + pad2(m.mes + 1)) : String(m.ano);
        return 'Relatorio_' + nomeArquivo(estado.nome) + '_' + per;
    }

    // ---------------- Excel (CSV) ----------------
    function csvCampo(v) {
        var s = String(v == null ? '' : v);
        return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function exportarCSV() {
        var m = estado.modelo;
        if (!m) return;
        var L = [];
        L.push(['Relatório Individual de Atividades']);
        L.push(['Servidor/Colaborador', estado.nome]);
        L.push(['Lotação', estado.lotacao || '']);
        L.push(['Período', m.periodo]);
        L.push([]);
        if (m.tipo === 'mes') {
            L.push(['Data', 'Dia', 'Situação', 'Atividade', 'Quantidade', 'Total do dia']);
            m.dias.forEach(function (d) {
                if (!d.itens.length) { L.push([dataBR(d.data), d.semana, d.ausencia, '', 0, 0]); return; }
                d.itens.forEach(function (it, i) {
                    L.push([dataBR(d.data), d.semana, d.ausencia, it.ativ, it.qtd, i === 0 ? d.total : '']);
                });
            });
            L.push([]);
            L.push(['Atividade', 'Quantidade']);
            m.resumo.forEach(function (r) { L.push([r.ativ, r.qtd]); });
            L.push(['TOTAL GERAL', m.total]);
        } else {
            L.push(['Atividade'].concat(MESES, ['Total']));
            m.linhas.forEach(function (l) { L.push([l.ativ].concat(l.meses, [l.total])); });
            L.push(['TOTAL GERAL'].concat(m.totMes, [m.total]));
        }
        var csv = L.map(function (row) { return row.map(csvCampo).join(';'); }).join('\r\n');
        var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        var url = URL.createObjectURL(blob);
        link.href = url;
        link.download = sufixoArquivo() + '.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        avisar('Arquivo Excel (CSV) gerado.');
    }

    // ---------------- Imprimir ----------------
    function imprimir() {
        var m = estado.modelo;
        if (!m) return;
        var orientacao = m.tipo === 'ano' ? 'landscape' : 'portrait';
        var w = window.open('', '_blank');
        if (!w) { avisar('Permita pop-ups deste site para imprimir.'); return; }
        w.document.open();
        w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>' + esc(sufixoArquivo()) + '</title>' +
            '<style>@page{size:A4 ' + orientacao + ';margin:12mm;}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' + CSS_RELATORIO + '</style>' +
            '</head><body>' + htmlRelatorio(m) + '</body></html>');
        w.document.close();
        w.focus();
        setTimeout(function () { w.print(); }, 300);
    }

    // ---------------- PDF (html2pdf) ----------------
    var _html2pdfPromise = null;
    function carregarHtml2pdf() {
        if (typeof html2pdf !== 'undefined') return Promise.resolve();
        if (_html2pdfPromise) return _html2pdfPromise;
        _html2pdfPromise = new Promise(function (ok, falha) {
            var s = document.createElement('script');
            s.src = HTML2PDF_URL;
            s.onload = function () { ok(); };
            s.onerror = function () { _html2pdfPromise = null; falha(new Error('html2pdf indisponível')); };
            document.head.appendChild(s);
        });
        return _html2pdfPromise;
    }

    async function gerarPDF() {
        var m = estado.modelo;
        if (!m) return;
        var btn = document.getElementById('relBtnPdf');
        btn.disabled = true;
        var textoOriginal = btn.textContent;
        btn.textContent = 'Gerando...';
        var paisagem = m.tipo === 'ano';
        // largura útil da página A4 (margens de 10 mm) em pixels CSS
        var largura = paisagem ? 1045 : 718;
        var box = document.createElement('div');
        // fica no canto da página, por baixo de tudo (o html2canvas precisa dele
        // posicionado em 0,0 para não cortar/deslocar o conteúdo)
        box.style.cssText = 'position:absolute;left:0;top:0;width:' + largura + 'px;background:#fff;z-index:-1;pointer-events:none;';
        box.innerHTML = htmlRelatorio(m);
        box.firstChild.style.padding = '0 6px'; // folga para as bordas da tabela não encostarem na margem
        document.body.appendChild(box);
        try {
            await carregarHtml2pdf();
            await html2pdf().set({
                margin: 10,
                filename: sufixoArquivo() + '.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false, width: largura, windowWidth: largura, scrollX: 0, scrollY: 0, x: 0, y: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: paisagem ? 'landscape' : 'portrait' },
                pagebreak: { mode: ['css'], avoid: ['tr', 'tbody.rel-dia', '.rel-bloco', '.rel-cab', '.rel-resumo', '.rel-rodape'] }
            }).from(box.firstChild).save();
            avisar('PDF gerado com sucesso!');
        } catch (e) {
            console.error('Relatório PDF:', e);
            avisar('Não foi possível gerar o PDF. Tente "Imprimir" e escolha "Salvar como PDF".');
        } finally {
            document.body.removeChild(box);
            btn.disabled = false;
            btn.textContent = textoOriginal;
        }
    }

    window.abrirRelatorioServidor = abrirRelatorioServidor;
    // expostas para testes
    window._relatorioServidor = { montarMensal: montarMensal, montarAnual: montarAnual, htmlRelatorio: htmlRelatorio };

    injetarEstilos();
})();
