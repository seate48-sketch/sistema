// ============================================================
// SEATE - Relatório Estatístico em PDF (botão "Gerar Relatório PDF")
// ============================================================
// Usado por estatistica.html e dashboard.html (as duas páginas ficam
// sempre iguais). Também gera os relatórios das seções "Resultados por
// Atividade" e "Relatório por Servidor" (mais abaixo). Relatório geral:
//   1. Resumo Geral (tabela por ano: SEATE, NAHORA, total)
//   2. Top 10 Atividades Mais Realizadas
//   3. Top 10 Serviços Menos Realizados
//   4. Atividades Mensais do ano atual
// Cada gráfico sai exatamente com os filtros que estão na tela, redesenhado
// em tamanho próprio para impressão, com um resumo curto (até 10 linhas)
// abaixo. Duas seções por página, nada cortado entre páginas e sem páginas
// em branco. Layout igual ao do relatório individual do servidor.
//
// Depende de: Chart.js, html2pdf, obterSeateNahoraPorAno e
// getAnosDisponiveis (common.js), formatarMilhar e feedback.
// ============================================================

(function () {
    'use strict';

    var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var LARGURA = 718;       // largura útil de uma página A4 retrato (margens de 10 mm), em px
    var ALTURA_GRAFICO = 330;

    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function num(n) {
        if (typeof formatarMilhar === 'function') return formatarMilhar(Math.round(n || 0));
        return Math.round(n || 0).toLocaleString('pt-BR');
    }
    function pct(parte, total) {
        if (!total) return '0%';
        return (parte * 100 / total).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
    }
    function avisar(msg) { if (typeof feedback === 'function') feedback(msg); else alert(msg); }
    function agora() {
        var d = new Date();
        var p = function (n) { return String(n).padStart(2, '0'); };
        return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' às ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    function anoAtual() { return (typeof ANO_ATUAL !== 'undefined') ? String(ANO_ATUAL) : String(new Date().getFullYear()); }

    // ---------------- estilos (mesmos do relatório individual) ----------------
    var CSS = [
        '.rel-doc{font-family:"Segoe UI",Roboto,Arial,sans-serif;color:#1F2937;font-size:11px;line-height:1.35;background:#fff;padding:0 6px;}',
        '.rel-doc *{box-sizing:border-box;}',
        '.rel-cab{border-bottom:1.5px solid #1F4E79;padding-bottom:8px;margin-bottom:12px;}',
        '.rel-cab-topo{display:flex;justify-content:space-between;align-items:baseline;gap:12px;}',
        '.rel-titulo{font-size:14px;font-weight:600;color:#0F2D52;margin:0;}',
        '.rel-orgao{font-size:9.5px;color:#6B7280;text-align:right;}',
        '.rel-info{display:grid;grid-template-columns:1.4fr 1fr 1.2fr;gap:4px 16px;margin-top:8px;}',
        '.rel-info div{font-size:11px;}',
        '.rel-info span{display:block;font-size:8.5px;text-transform:uppercase;letter-spacing:.04em;color:#6B7280;}',
        '.rel-secao{font-size:11.5px;font-weight:600;color:#0F2D52;margin:0 0 2px;}',
        '.rel-subtitulo{font-size:9.5px;color:#6B7280;margin:0 0 6px;}',
        '.rel-bloco{margin-bottom:16px;}',
        '.rel-tab{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10.5px;}',
        '.rel-tab th{background:#F3F4F6;color:#374151;font-weight:600;border:1px solid #D1D5DB;padding:4px 6px;text-align:left;}',
        '.rel-tab td{border:1px solid #E5E7EB;padding:3px 6px;}',
        '.rel-tab .n{text-align:right;white-space:nowrap;}',
        '.rel-tab tr.rel-total td{font-weight:600;background:#F9FAFB;border-top:1.5px solid #9CA3AF;color:#0F2D52;}',
        '.rel-grafico{border:1px solid #E5E7EB;padding:6px;text-align:center;}',
        '.rel-grafico img{width:100%;height:auto;display:block;}',
        '.rel-resumo-txt{margin-top:6px;padding:6px 10px;border-left:3px solid #1F4E79;background:#F9FAFB;font-size:10.2px;line-height:1.45;}',
        '.rel-resumo-txt div{margin:0;}',
        '.rel-vazio{padding:18px;text-align:center;color:#6B7280;border:1px dashed #D1D5DB;}',
        '.rel-rodape{margin-top:10px;padding-top:6px;border-top:1px solid #E5E7EB;font-size:8.5px;color:#9CA3AF;display:flex;justify-content:space-between;}',
        '.rel-bloco,.rel-cab,.rel-doc tr{break-inside:avoid;page-break-inside:avoid;}'
    ].join('\n');

    // ---------------- redesenha um gráfico da tela em tamanho de impressão ----------------
    function imagemDoGrafico(chart, altura) {
        return new Promise(function (resolve) {
            if (!chart || typeof Chart === 'undefined') { resolve(''); return; }
            var cv = document.createElement('canvas');
            cv.width = LARGURA;       // o Chart.js dobra a resolução (devicePixelRatio: 2)
            cv.height = altura;
            cv.style.cssText = 'position:absolute;left:-10000px;top:0;width:' + LARGURA + 'px;height:' + altura + 'px;';
            document.body.appendChild(cv);
            var copia = null;
            try {
                var cfg = chart.config;
                var opcoes = Object.assign({}, cfg.options || {}, {
                    responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: 2
                });
                // letras dos eixos maiores, para leitura no papel
                var escalas = {};
                var orig = (cfg.options && cfg.options.scales) || {};
                ['x', 'y'].forEach(function (k) {
                    var e = Object.assign({}, orig[k] || {});
                    e.ticks = Object.assign({}, e.ticks || {}, { font: { size: 10 }, color: '#374151' });
                    escalas[k] = e;
                });
                opcoes.scales = escalas;
                copia = new Chart(cv.getContext('2d'), {
                    type: cfg.type,
                    data: {
                        labels: (chart.data.labels || []).slice(),
                        datasets: chart.data.datasets.map(function (d) { return Object.assign({}, d, { data: d.data.slice() }); })
                    },
                    options: opcoes,
                    plugins: (cfg.plugins || []).slice()
                });
                // fundo branco (a imagem PNG vem transparente)
                var ctx = cv.getContext('2d');
                ctx.save();
                ctx.globalCompositeOperation = 'destination-over';
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, cv.width, cv.height);
                ctx.restore();
                resolve(cv.toDataURL('image/png'));
            } catch (e) {
                console.warn('Relatório: não foi possível redesenhar o gráfico', e);
                try { resolve(chart.canvas.toDataURL('image/png')); } catch (e2) { resolve(''); }
            } finally {
                if (copia) copia.destroy();
                cv.parentNode.removeChild(cv);
            }
        });
    }

    function dadosDoGrafico(chart) {
        if (!chart || !chart.data || !chart.data.datasets || !chart.data.datasets[0]) return [];
        var labels = chart.data.labels || [];
        var vals = chart.data.datasets[0].data || [];
        return labels.map(function (l, i) { return { nome: String(l), total: +vals[i] || 0 }; });
    }

    function tituloDoCard(id, padrao) {
        var h = document.querySelector('#' + id + ' h4');
        var t = h ? h.textContent.trim() : '';
        return t || padrao;
    }
    // "Top 10 Atividades Mais Realizadas — 2026 (SEATE + NAHORA)" → subtítulo "2026 (SEATE + NAHORA)"
    function filtroDoTitulo(t) {
        var i = t.indexOf('—');
        return i >= 0 ? t.slice(i + 1).trim() : '';
    }

    function linhas(lista) {
        return '<div class="rel-resumo-txt">' + lista.slice(0, 10).map(function (l) { return '<div>• ' + l + '</div>'; }).join('') + '</div>';
    }

    // ---------------- seções ----------------
    async function secaoResumoGeral() {
        var anos = (typeof getAnosDisponiveis === 'function') ? getAnosDisponiveis() : [anoAtual()];
        var dados = [];
        for (var i = 0; i < anos.length; i++) {
            var t = await obterSeateNahoraPorAno(anos[i]);
            var s = (t && t.seateTotal) || 0, n = (t && t.nahoraTotal) || 0;
            dados.push({ ano: String(anos[i]), seate: s, nahora: n, total: s + n });
        }
        var totS = 0, totN = 0;
        dados.forEach(function (d) { totS += d.seate; totN += d.nahora; });
        var tot = totS + totN;

        var h = '<div class="rel-bloco"><div class="rel-secao">Resumo Geral</div>' +
                '<div class="rel-subtitulo">Total de atividades por ano e por setor</div>' +
                '<table class="rel-tab"><thead><tr><th>Ano</th><th class="n">SEATE</th><th class="n">NAHORA</th><th class="n">Total</th><th class="n">% do total</th></tr></thead><tbody>';
        dados.forEach(function (d) {
            h += '<tr><td>' + esc(d.ano) + (d.ano === anoAtual() ? ' <span style="color:#6B7280">(em andamento)</span>' : '') + '</td>' +
                 '<td class="n">' + num(d.seate) + '</td><td class="n">' + num(d.nahora) + '</td><td class="n"><b>' + num(d.total) + '</b></td>' +
                 '<td class="n">' + pct(d.total, tot) + '</td></tr>';
        });
        h += '<tr class="rel-total"><td>TOTAL GERAL</td><td class="n">' + num(totS) + '</td><td class="n">' + num(totN) + '</td><td class="n">' + num(tot) + '</td><td class="n">100,0%</td></tr>';
        h += '</tbody></table>';

        var completos = dados.filter(function (d) { return d.ano !== anoAtual(); });
        var r = [];
        if (dados.length) {
            r.push('Período: <b>' + dados[0].ano + ' a ' + dados[dados.length - 1].ano + '</b> (' + dados.length + ' anos), com <b>' + num(tot) + '</b> atividades registradas.');
            r.push('Participação por setor: SEATE <b>' + pct(totS, tot) + '</b> (' + num(totS) + ') e NAHORA <b>' + pct(totN, tot) + '</b> (' + num(totN) + ').');
        }
        if (completos.length) {
            var maior = completos.reduce(function (a, b) { return b.total > a.total ? b : a; });
            var menor = completos.reduce(function (a, b) { return b.total < a.total ? b : a; });
            var media = completos.reduce(function (s, d) { return s + d.total; }, 0) / completos.length;
            r.push('Ano de maior volume: <b>' + maior.ano + '</b> (' + num(maior.total) + '); menor volume: <b>' + menor.ano + '</b> (' + num(menor.total) + ').');
            r.push('Média anual dos anos completos: <b>' + num(media) + '</b> atividades.');
            if (completos.length >= 2) {
                var ult = completos[completos.length - 1], pen = completos[completos.length - 2];
                if (pen.total > 0) {
                    var v = (ult.total - pen.total) * 100 / pen.total;
                    r.push('De ' + pen.ano + ' para ' + ult.ano + ': variação de <b>' + (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%</b>.');
                }
            }
        }
        var atual = dados.filter(function (d) { return d.ano === anoAtual(); })[0];
        if (atual) r.push(atual.ano + ' (em andamento): <b>' + num(atual.total) + '</b> atividades até o momento.');
        h += linhas(r) + '</div>';
        return h;
    }

    async function secaoTop10Mais() {
        var titulo = tituloDoCard('graficoTop10ConfigCard', 'Top 10 Atividades Mais Realizadas');
        var chart = window.chartTop10Config;
        var itens = dadosDoGrafico(chart);
        var h = '<div class="rel-bloco"><div class="rel-secao">Top 10 Atividades Mais Realizadas</div>' +
                '<div class="rel-subtitulo">' + esc(filtroDoTitulo(titulo) || 'Conforme filtro da tela') + '</div>';
        if (!itens.length) return h + '<div class="rel-vazio">Nenhum dado para o filtro selecionado.</div></div>';
        h += '<div class="rel-grafico"><img src="' + await imagemDoGrafico(chart, ALTURA_GRAFICO) + '" alt=""></div>';
        var soma = itens.reduce(function (s, i) { return s + i.total; }, 0);
        var r = [];
        r.push('As 10 atividades somam <b>' + num(soma) + '</b> registros.');
        r.push('1º lugar: <b>' + esc(itens[0].nome) + '</b>, com ' + num(itens[0].total) + ' (' + pct(itens[0].total, soma) + ' do Top 10).');
        if (itens[1]) r.push('2º lugar: ' + esc(itens[1].nome) + ' (' + num(itens[1].total) + ').');
        if (itens[2]) r.push('3º lugar: ' + esc(itens[2].nome) + ' (' + num(itens[2].total) + ').');
        if (itens.length >= 3) {
            var tres = itens[0].total + itens[1].total + itens[2].total;
            r.push('As 3 primeiras concentram <b>' + pct(tres, soma) + '</b> do volume do Top 10.');
        }
        var ult = itens[itens.length - 1];
        if (itens.length > 1 && ult.total > 0) {
            r.push('A 1ª colocada tem ' + (itens[0].total / ult.total).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' vezes o volume da ' + itens.length + 'ª (' + esc(ult.nome) + ', ' + num(ult.total) + ').');
        }
        r.push('Média por atividade no Top 10: <b>' + num(soma / itens.length) + '</b>.');
        h += linhas(r) + '</div>';
        return h;
    }

    async function secaoTop10Menos() {
        var titulo = tituloDoCard('graficoTop10MenosConfigCard', 'Top 10 Serviços Menos Realizados');
        var chart = window.chartTop10MenosConfig;
        var itens = dadosDoGrafico(chart);
        var h = '<div class="rel-bloco"><div class="rel-secao">Top 10 Atividades Menos Realizadas</div>' +
                '<div class="rel-subtitulo">' + esc(filtroDoTitulo(titulo) || 'Conforme filtro da tela') + '</div>';
        if (!itens.length) return h + '<div class="rel-vazio">Nenhum dado para o filtro selecionado.</div></div>';
        h += '<div class="rel-grafico"><img src="' + await imagemDoGrafico(chart, ALTURA_GRAFICO) + '" alt=""></div>';
        var soma = itens.reduce(function (s, i) { return s + i.total; }, 0);
        var ordem = itens.slice().sort(function (a, b) { return a.total - b.total; });
        var zeros = itens.filter(function (i) { return !i.total; }).length;
        var r = [];
        r.push('As 10 atividades de menor volume somam <b>' + num(soma) + '</b> registros.');
        r.push('Menor volume: <b>' + esc(ordem[0].nome) + '</b>, com ' + num(ordem[0].total) + '.');
        if (ordem[1]) r.push('Em seguida: ' + esc(ordem[1].nome) + ' (' + num(ordem[1].total) + ').');
        var maior = ordem[ordem.length - 1];
        r.push('Maior volume entre as 10: ' + esc(maior.nome) + ' (' + num(maior.total) + ').');
        r.push('Média por atividade neste grupo: <b>' + num(soma / itens.length) + '</b>.');
        if (zeros) r.push('<b>' + zeros + '</b> atividade(s) sem nenhum registro no período.');
        h += linhas(r) + '</div>';
        return h;
    }

    async function secaoMensal() {
        var titulo = tituloDoCard('graficoMensalAnoAtualCard', 'Atividades Mensais - ' + anoAtual());
        var chart = window.chartMensalAnoAtual;
        var itens = dadosDoGrafico(chart);
        var h = '<div class="rel-bloco"><div class="rel-secao">' + esc(titulo) + '</div>' +
                '<div class="rel-subtitulo">Total de atividades por mês</div>';
        if (!itens.length) return h + '<div class="rel-vazio">Nenhum dado disponível.</div></div>';
        h += '<div class="rel-grafico"><img src="' + await imagemDoGrafico(chart, 300) + '" alt=""></div>';
        var comDados = [];
        itens.forEach(function (it, i) { if (it.total > 0) comDados.push({ mes: MESES[i] || it.nome, total: it.total, i: i }); });
        var soma = itens.reduce(function (s, i) { return s + i.total; }, 0);
        var r = [];
        r.push('Total em ' + anoAtual() + ' até o momento: <b>' + num(soma) + '</b> atividades.');
        if (comDados.length) {
            var maior = comDados.reduce(function (a, b) { return b.total > a.total ? b : a; });
            var menor = comDados.reduce(function (a, b) { return b.total < a.total ? b : a; });
            r.push('Meses com registros: <b>' + comDados.length + '</b>.');
            r.push('Mês de maior volume: <b>' + maior.mes + '</b> (' + num(maior.total) + ').');
            r.push('Mês de menor volume (entre os que têm registros): <b>' + menor.mes + '</b> (' + num(menor.total) + ').');
            r.push('Média mensal: <b>' + num(soma / comDados.length) + '</b> atividades.');
            if (comDados.length >= 2) {
                var u = comDados[comDados.length - 1], a = comDados[comDados.length - 2];
                if (a.total > 0) {
                    var v = (u.total - a.total) * 100 / a.total;
                    r.push('De ' + a.mes + ' para ' + u.mes + ': variação de <b>' + (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%</b>.');
                }
            }
        }
        h += linhas(r) + '</div>';
        return h;
    }

    // ---------------- geração ----------------
    var gerando = false;
    async function gerarRelatorioPDF() {
        if (gerando) return;
        if (typeof html2pdf === 'undefined') { avisar('Não foi possível carregar o gerador de PDF. Verifique sua conexão.'); return; }
        gerando = true;
        avisar('Gerando relatório...');
        var box = null;
        try {
            var partes = await Promise.all([secaoResumoGeral(), secaoTop10Mais(), secaoTop10Menos(), secaoMensal()]);
            var anos = (typeof getAnosDisponiveis === 'function') ? getAnosDisponiveis() : [anoAtual()];
            var cab = '<div class="rel-cab">' +
                '<div class="rel-cab-topo"><h2 class="rel-titulo">Relatório Estatístico</h2>' +
                '<div class="rel-orgao">SEATE · Justiça Federal – SJDF</div></div>' +
                '<div class="rel-info">' +
                    '<div><span>Período</span>' + esc(anos[0] + ' a ' + anos[anos.length - 1]) + '</div>' +
                    '<div><span>Setores</span>SEATE e NAHORA</div>' +
                    '<div><span>Gerado em</span>' + agora() + '</div>' +
                '</div></div>';
            var rodape = '<div class="rel-rodape"><span>SEATE – Sistema de Gestão de Atividades</span><span>Gerado em ' + agora() + '</span></div>';
            // página 1: cabeçalho + Resumo Geral + Top 10 mais | página 2: Top 10 menos + Mensal
            var html = '<style>' + CSS + '</style><div class="rel-doc">' + cab + partes[0] + partes[1] +
                       '<div class="rel-pagina2">' + partes[2] + partes[3] + rodape + '</div></div>';

            box = document.createElement('div');
            box.style.cssText = 'position:absolute;left:0;top:0;width:' + LARGURA + 'px;background:#fff;z-index:-1;pointer-events:none;';
            box.innerHTML = html;
            document.body.appendChild(box);
            // espera as imagens dos gráficos carregarem
            await Promise.all(Array.prototype.map.call(box.querySelectorAll('img'), function (img) {
                return img.complete ? Promise.resolve() : new Promise(function (ok) { img.onload = img.onerror = ok; });
            }));

            await html2pdf().set({
                margin: 10,
                filename: 'Relatorio_Estatistico_SEATE_' + new Date().toISOString().slice(0, 10) + '.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false, width: LARGURA, windowWidth: LARGURA, scrollX: 0, scrollY: 0, x: 0, y: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css'], before: ['.rel-pagina2'], avoid: ['.rel-bloco', '.rel-cab', 'tr', '.rel-rodape'] }
            }).from(box.querySelector('.rel-doc')).save();
            avisar('Relatório gerado com sucesso!');
        } catch (e) {
            console.error('Relatório estatístico:', e);
            avisar('Erro ao gerar o relatório. Tente novamente.');
        } finally {
            if (box && box.parentNode) box.parentNode.removeChild(box);
            gerando = false;
        }
    }

    window.gerarRelatorioPDF = gerarRelatorioPDF;

    // =====================================================================
    // FUNÇÕES COMUNS PARA OS RELATÓRIOS DE SEÇÃO (Resultados por Atividade
    // e Relatório por Servidor)
    // =====================================================================
    function cabecalho(titulo, info) {
        return '<div class="rel-cab">' +
            '<div class="rel-cab-topo"><h2 class="rel-titulo">' + esc(titulo) + '</h2>' +
            '<div class="rel-orgao">SEATE · Justiça Federal – SJDF</div></div>' +
            '<div class="rel-info">' + info.map(function (i) {
                return '<div><span>' + esc(i[0]) + '</span>' + esc(i[1]) + '</div>';
            }).join('') + '</div></div>';
    }
    function rodape() {
        return '<div class="rel-rodape"><span>SEATE – Sistema de Gestão de Atividades</span><span>Gerado em ' + agora() + '</span></div>';
    }
    function nomeMesBonito(m) { return m === 'Marco' ? 'Março' : m; }
    function setorTexto(setor) { return setor === 'SEATE' ? 'SEATE' : setor === 'NAHORA' ? 'NAHORA' : 'SEATE e NAHORA'; }
    function variacaoTxt(de, para) {
        if (!de) return '';
        var v = (para - de) * 100 / de;
        return (v > 0 ? '+' : '') + v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';
    }

    async function gerarPDF(conteudo, arquivo) {
        var box = document.createElement('div');
        box.style.cssText = 'position:absolute;left:0;top:0;width:' + LARGURA + 'px;background:#fff;z-index:-1;pointer-events:none;';
        box.innerHTML = '<style>' + CSS + '</style><div class="rel-doc">' + conteudo + '</div>';
        document.body.appendChild(box);
        try {
            await Promise.all(Array.prototype.map.call(box.querySelectorAll('img'), function (img) {
                return img.complete ? Promise.resolve() : new Promise(function (ok) { img.onload = img.onerror = ok; });
            }));
            await html2pdf().set({
                margin: 10,
                filename: arquivo,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false, width: LARGURA, windowWidth: LARGURA, scrollX: 0, scrollY: 0, x: 0, y: 0 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['css'], avoid: ['.rel-bloco', '.rel-cab', 'tr', '.rel-rodape', '.rel-resumo-txt'] }
            }).from(box.querySelector('.rel-doc')).save();
        } finally {
            if (box.parentNode) box.parentNode.removeChild(box);
        }
    }

    function baixarCSV(linhasCsv, arquivo) {
        var campo = function (v) { var s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        var csv = linhasCsv.map(function (l) { return l.map(campo).join(';'); }).join('\r\n');
        var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        var a = document.createElement('a');
        var url = URL.createObjectURL(blob);
        a.href = url; a.download = arquivo;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    // =====================================================================
    // RESULTADOS POR ATIVIDADE
    // =====================================================================
    function filtrosResultado() {
        var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
        var anoDe = parseInt(g('selectAnoDeResultado'), 10), anoAte = parseInt(g('selectAnoAteResultado'), 10);
        var mesDe = parseInt(g('selectMesDeResultado'), 10), mesAte = parseInt(g('selectMesAteResultado'), 10);
        if (anoDe > anoAte) { var t = anoDe; anoDe = anoAte; anoAte = t; }
        if (anoDe === anoAte && mesDe > mesAte) { var t2 = mesDe; mesDe = mesAte; mesAte = t2; }
        var periodo = (anoDe === anoAte)
            ? (mesDe === mesAte ? MESES[mesDe] + ' de ' + anoDe : MESES[mesDe] + ' a ' + MESES[mesAte] + ' de ' + anoDe)
            : (MESES[mesDe] + '/' + anoDe + ' a ' + MESES[mesAte] + '/' + anoAte);
        var nMeses = (anoAte - anoDe) * 12 + (mesAte - mesDe) + 1;
        return { anoDe: anoDe, anoAte: anoAte, mesDe: mesDe, mesAte: mesAte, setor: g('selectSetorResultado') || 'ambos', periodo: periodo, nMeses: nMeses };
    }

    // soma de todas as atividades por mês (na ordem do período)
    function totaisPorMes(resultado) {
        var mapa = {}, ordem = [];
        resultado.porAtividade.forEach(function (b) {
            b.linhas.forEach(function (l) {
                var k = l.ano + '-' + l.mesNome;
                if (!mapa[k]) { mapa[k] = { rotulo: nomeMesBonito(l.mesNome) + '/' + l.ano, total: 0, ano: l.ano, idx: MESES_IDX(l.mesNome) }; ordem.push(k); }
                mapa[k].total += l.total;
            });
        });
        return ordem.map(function (k) { return mapa[k]; }).sort(function (a, b) { return (a.ano - b.ano) || (a.idx - b.idx); });
    }
    function MESES_IDX(m) { var i = MESES.indexOf(nomeMesBonito(m)); return i < 0 ? 0 : i; }

    function resumoResultados(resultado, f) {
        var r = [];
        var tot = resultado.totalGeral;
        var n = resultado.porAtividade.length;
        r.push('Período: <b>' + esc(f.periodo) + '</b> · ' + n + ' atividade(s) com registros · setor: ' + setorTexto(f.setor) + '.');
        r.push('Total geral: <b>' + num(tot) + '</b> atividades' + (f.setor === 'ambos' ? ' (SEATE ' + pct(resultado.totalSeate, tot) + ' | NAHORA ' + pct(resultado.totalNahora, tot) + ').' : '.'));
        var maior = resultado.porAtividade[0];
        if (maior) r.push('Maior volume: <b>' + esc(maior.nome) + '</b>, com ' + num(maior.total) + ' (' + pct(maior.total, tot) + ' do total).');
        if (n > 1) {
            var menor = resultado.porAtividade[n - 1];
            r.push('Menor volume: ' + esc(menor.nome) + ' (' + num(menor.total) + ').');
        }
        if (n >= 3) {
            var tres = resultado.porAtividade[0].total + resultado.porAtividade[1].total + resultado.porAtividade[2].total;
            r.push('As 3 atividades de maior volume concentram <b>' + pct(tres, tot) + '</b> do total.');
        }
        var meses = totaisPorMes(resultado);
        if (meses.length) {
            var mx = meses.reduce(function (a, b) { return b.total > a.total ? b : a; });
            var mn = meses.reduce(function (a, b) { return b.total < a.total ? b : a; });
            r.push('Mês de maior volume: <b>' + mx.rotulo + '</b> (' + num(mx.total) + '); menor: ' + mn.rotulo + ' (' + num(mn.total) + ').');
            r.push('Média mensal no período: <b>' + num(tot / Math.max(1, f.nMeses)) + '</b> atividades.');
            if (meses.length >= 2) {
                var pr = meses[0], ul = meses[meses.length - 1];
                var vt = variacaoTxt(pr.total, ul.total);
                if (vt) r.push('Do primeiro (' + pr.rotulo + ') ao último mês (' + ul.rotulo + '): variação de <b>' + vt + '</b>.');
            }
        }
        return r;
    }

    // resumo curto na TELA, abaixo da tabela (substitui o "Resumo Analítico")
    function renderizarResumoAnaliticoMulti(resultado, setor) {
        var c = document.getElementById('resumoAnaliticoAtividade');
        if (!c) return;
        if (!resultado || !resultado.porAtividade || !resultado.porAtividade.length || !resultado.totalGeral) { c.innerHTML = ''; return; }
        var f = filtrosResultado();
        f.setor = setor || f.setor;
        c.innerHTML = '<div style="margin-top:14px;padding:12px 16px;border-left:4px solid var(--azul-institucional);background:var(--cinza-suave);border-radius:10px;font-size:0.82rem;line-height:1.55;color:#1F2937;">' +
            '<div style="font-weight:700;color:var(--azul-marinho);margin-bottom:4px;">Resumo</div>' +
            resumoResultados(resultado, f).map(function (l) { return '<div>• ' + l + '</div>'; }).join('') + '</div>';
    }

    var gerandoAnalitico = false;
    async function gerarRelatorioAnalitico() {
        if (gerandoAnalitico) return;
        if (typeof html2pdf === 'undefined') { avisar('Não foi possível carregar o gerador de PDF. Verifique sua conexão.'); return; }
        var resultado = (typeof dadosFiltradosAtuais !== 'undefined') ? dadosFiltradosAtuais : null;
        if (!resultado || !resultado.porAtividade || !resultado.porAtividade.length || !resultado.totalGeral) {
            avisar('Clique em "Filtrar" primeiro para escolher o período e as atividades do relatório.');
            return;
        }
        gerandoAnalitico = true;
        avisar('Gerando relatório...');
        try {
            var f = filtrosResultado();
            var ambos = f.setor === 'ambos', comS = f.setor !== 'NAHORA', comN = f.setor !== 'SEATE';
            var tot = resultado.totalGeral;
            var h = cabecalho('Relatório de Resultados por Atividade', [
                ['Período', f.periodo], ['Setores', setorTexto(f.setor)], ['Gerado em', agora()]
            ]);

            // visão geral
            h += '<div class="rel-bloco"><div class="rel-secao">Visão geral</div>' +
                 '<div class="rel-subtitulo">Total de cada atividade no período</div>' +
                 '<table class="rel-tab"><thead><tr><th style="width:44%">Atividade</th>' +
                 (comS ? '<th class="n">SEATE</th>' : '') + (comN ? '<th class="n">NAHORA</th>' : '') +
                 '<th class="n">Total</th><th class="n">% do total</th></tr></thead><tbody>';
            resultado.porAtividade.forEach(function (b) {
                h += '<tr><td>' + esc(b.nome) + '</td>' + (comS ? '<td class="n">' + num(b.totalSeate) + '</td>' : '') +
                     (comN ? '<td class="n">' + num(b.totalNahora) + '</td>' : '') +
                     '<td class="n"><b>' + num(b.total) + '</b></td><td class="n">' + pct(b.total, tot) + '</td></tr>';
            });
            h += '<tr class="rel-total"><td>TOTAL GERAL</td>' + (comS ? '<td class="n">' + num(resultado.totalSeate) + '</td>' : '') +
                 (comN ? '<td class="n">' + num(resultado.totalNahora) + '</td>' : '') +
                 '<td class="n">' + num(tot) + '</td><td class="n">100,0%</td></tr></tbody></table>';
            h += linhas(resumoResultados(resultado, f)) + '</div>';

            // detalhamento
            h += '<div class="rel-secao" style="margin-top:4px;">Detalhamento por atividade</div>';
            resultado.porAtividade.forEach(function (b) {
                h += '<div class="rel-bloco" style="margin-top:8px;"><div class="rel-subtitulo" style="color:#0F2D52;font-weight:600;font-size:10.5px;">' + esc(b.nome) + '</div>' +
                     '<table class="rel-tab"><thead><tr><th>Mês</th>' + (comS ? '<th class="n">SEATE</th>' : '') +
                     (comN ? '<th class="n">NAHORA</th>' : '') + '<th class="n">Total</th></tr></thead><tbody>';
                b.linhas.forEach(function (l) {
                    h += '<tr><td>' + nomeMesBonito(l.mesNome) + '/' + l.ano + '</td>' + (comS ? '<td class="n">' + num(l.seate) + '</td>' : '') +
                         (comN ? '<td class="n">' + num(l.nahora) + '</td>' : '') + '<td class="n">' + num(l.total) + '</td></tr>';
                });
                h += '<tr class="rel-total"><td>SUBTOTAL</td>' + (comS ? '<td class="n">' + num(b.totalSeate) + '</td>' : '') +
                     (comN ? '<td class="n">' + num(b.totalNahora) + '</td>' : '') + '<td class="n">' + num(b.total) + '</td></tr></tbody></table>';
                var r = [];
                r.push('Total no período: <b>' + num(b.total) + '</b> (' + pct(b.total, tot) + ' do total geral)' +
                       (ambos ? ' · SEATE ' + pct(b.totalSeate, b.total) + ' | NAHORA ' + pct(b.totalNahora, b.total) : '') + '.');
                if (b.linhas.length) {
                    var mx = b.linhas.reduce(function (a, c) { return c.total > a.total ? c : a; });
                    var mn = b.linhas.reduce(function (a, c) { return c.total < a.total ? c : a; });
                    r.push('Maior mês: ' + nomeMesBonito(mx.mesNome) + '/' + mx.ano + ' (' + num(mx.total) + '); menor: ' + nomeMesBonito(mn.mesNome) + '/' + mn.ano + ' (' + num(mn.total) + ').');
                    r.push('Média mensal: <b>' + num(b.total / Math.max(1, f.nMeses)) + '</b> · meses com registro: ' + b.linhas.length + ' de ' + f.nMeses + '.');
                }
                h += linhas(r) + '</div>';
            });
            h += rodape();
            await gerarPDF(h, 'Relatorio_Resultados_por_Atividade_' + new Date().toISOString().slice(0, 10) + '.pdf');
            avisar('Relatório gerado com sucesso!');
        } catch (e) {
            console.error('Relatório por atividade:', e);
            avisar('Erro ao gerar o relatório. Tente novamente.');
        } finally {
            gerandoAnalitico = false;
        }
    }

    // =====================================================================
    // RELATÓRIO POR SERVIDOR
    // =====================================================================
    var ultimoServidor = null;

    function selecionados(seletor) {
        return Array.prototype.map.call(document.querySelectorAll(seletor + ' .pill-item.selecionado'), function (c) { return c.getAttribute('data-value'); });
    }
    function lotacaoDe(nome) {
        try {
            if (typeof getLotacaoServidor === 'function') return getLotacaoServidor(nome) || '';
            if (typeof servidores !== 'undefined' && typeof lotacoes !== 'undefined') { var i = servidores.indexOf(nome); if (i >= 0) return lotacoes[i] || ''; }
        } catch (e) {}
        return '';
    }
    function somarPorServidor(registros, nomes, filtroAtiv, mesRef) {
        var out = {};
        nomes.forEach(function (n) { out[n] = { atividades: {}, total: 0, totalMes: 0, meses: {} }; });
        (registros || []).forEach(function (reg) {
            var o = out[reg.servidor];
            if (!o) return;
            var mesReg = parseInt(String(reg.data).slice(5, 7), 10) - 1;
            for (var at in (reg.atividades || {})) {
                if (filtroAtiv.length && filtroAtiv.indexOf(at) === -1) continue;
                var v = +reg.atividades[at] || 0;
                if (!v) continue;
                o.atividades[at] = (o.atividades[at] || 0) + v;
                o.total += v;
                var km = String(reg.data).slice(0, 7);
                o.meses[km] = (o.meses[km] || 0) + v;
                if (mesRef !== undefined && mesReg === mesRef) o.totalMes += v;
            }
        });
        return out;
    }

    async function filtrarRelatorioServidor() {
        var nomes = selecionados('#multiSelectServidoresRelatorio');
        var container = document.getElementById('containerRelatorioServidor');
        if (!nomes.length) { avisar('Selecione ao menos um servidor!'); return; }
        if (typeof supabaseDisponivel !== 'undefined' && !supabaseDisponivel) {
            container.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">Sem conexão com o servidor. Tente novamente.</div>';
            return;
        }
        var filtroAtiv = selecionados('#multiSelectAtividadesRelatorio');
        var g = function (id) { return parseInt(document.getElementById(id).value, 10); };
        var anoDe = g('selectAnoDeServidorRelatorio'), anoAte = g('selectAnoAteServidorRelatorio');
        var mesDe = g('selectMesDeServidorRelatorio'), mesAte = g('selectMesAteServidorRelatorio');
        if (anoDe > anoAte) { var t = anoDe; anoDe = anoAte; anoAte = t; }
        if (anoDe === anoAte && mesDe > mesAte) { var t2 = mesDe; mesDe = mesAte; mesAte = t2; }
        var p2 = function (n) { return String(n).padStart(2, '0'); };
        var dataIni = anoDe + '-' + p2(mesDe + 1) + '-01';
        var dataFim = anoAte + '-' + p2(mesAte + 1) + '-' + p2(new Date(anoAte, mesAte + 1, 0).getDate());

        // mês/ano de referência definidos pelo gestor na tela Principal
        try { if (typeof carregarConfiguracaoReal === 'function') await carregarConfiguracaoReal(); } catch (e) {}
        var mesRef = (typeof mesConfigurado !== 'undefined' && !isNaN(parseInt(mesConfigurado, 10))) ? parseInt(mesConfigurado, 10) : new Date().getMonth();
        var anoRef = (typeof anoConfigurado !== 'undefined' && !isNaN(parseInt(anoConfigurado, 10))) ? parseInt(anoConfigurado, 10) : new Date().getFullYear();

        container.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">Carregando...</div>';
        var regPeriodo = null, regAnoRef = null;
        try {
            var res = await Promise.all([
                dbCarregarRegistrosServidoresPeriodo(nomes, dataIni, dataFim),
                dbCarregarRegistrosServidoresPeriodo(nomes, anoRef + '-01-01', anoRef + '-12-31')
            ]);
            regPeriodo = res[0]; regAnoRef = res[1];
        } catch (e) { console.warn('Relatório por servidor:', e && e.message); }
        if (regPeriodo === null || regAnoRef === null) {
            container.innerHTML = '<div style="text-align:center; padding:30px; color:#888;">Não foi possível carregar os dados. Verifique sua conexão e tente novamente.</div>';
            ultimoServidor = null;
            return;
        }
        var periodo = somarPorServidor(regPeriodo, nomes, filtroAtiv);
        var ref = somarPorServidor(regAnoRef, nomes, filtroAtiv, mesRef);
        var nMeses = (anoAte - anoDe) * 12 + (mesAte - mesDe) + 1;
        var periodoTxt = (anoDe === anoAte)
            ? (mesDe === mesAte ? MESES[mesDe] + ' de ' + anoDe : MESES[mesDe] + ' a ' + MESES[mesAte] + ' de ' + anoDe)
            : (MESES[mesDe] + '/' + anoDe + ' a ' + MESES[mesAte] + '/' + anoAte);

        ultimoServidor = {
            periodo: periodoTxt, nMeses: nMeses, anoRef: anoRef, mesRef: mesRef, filtroAtiv: filtroAtiv,
            servidores: nomes.map(function (n) {
                var itens = Object.keys(periodo[n].atividades).map(function (a) { return { nome: a, total: periodo[n].atividades[a] }; })
                    .sort(function (a, b) { return b.total - a.total; });
                return { nome: n, lotacao: lotacaoDe(n), itens: itens, total: periodo[n].total, meses: periodo[n].meses,
                         totalAnoRef: ref[n].total, totalMesRef: ref[n].totalMes };
            })
        };

        var rotAno = 'TOTAL GERAL DO ANO DE REFERÊNCIA (' + anoRef + ')';
        var rotMes = 'TOTAL GERAL DO MÊS DE REFERÊNCIA (' + MESES[mesRef] + '/' + anoRef + ')';
        var html = '';
        ultimoServidor.servidores.forEach(function (s) {
            html += '<div class="relatorio-servidor-bloco"><h4>' + esc(s.nome) + '</h4>';
            if (!s.itens.length) {
                html += '<div style="color:#888; font-size:0.85rem; margin-bottom:8px;">Nenhum registro encontrado para esse período (e, se aplicável, para as atividades selecionadas).</div>';
                html += '<table class="tabela-resultados"><tbody>';
            } else {
                html += '<table class="tabela-resultados"><thead><tr><th>Atividade</th><th>Total</th></tr></thead><tbody>';
                s.itens.forEach(function (it) { html += '<tr><td>' + esc(it.nome) + '</td><td>' + num(it.total) + '</td></tr>'; });
                html += '<tr class="total-row"><td><strong>TOTAL DO PERÍODO</strong></td><td>' + num(s.total) + '</td></tr>';
            }
            html += '<tr class="total-row"><td><strong>' + rotAno + '</strong></td><td>' + num(s.totalAnoRef) + '</td></tr>';
            html += '<tr class="total-row"><td><strong>' + rotMes + '</strong></td><td>' + num(s.totalMesRef) + '</td></tr>';
            html += '</tbody></table></div>';
        });
        container.innerHTML = html;
    }

    function exigeFiltroServidor() {
        if (!ultimoServidor || !ultimoServidor.servidores.length) {
            avisar('Clique em "Filtrar" primeiro para escolher os servidores e o período.');
            return false;
        }
        return true;
    }

    function exportarCSVServidor() {
        if (!exigeFiltroServidor()) return;
        var u = ultimoServidor;
        var L = [['Relatório por Servidor'], ['Período', u.periodo], ['Mês de referência', MESES[u.mesRef] + '/' + u.anoRef]];
        if (u.filtroAtiv.length) L.push(['Atividades filtradas', u.filtroAtiv.join(', ')]);
        L.push([]);
        L.push(['Servidor', 'Lotação', 'Atividade', 'Total']);
        u.servidores.forEach(function (s) {
            s.itens.forEach(function (it) { L.push([s.nome, s.lotacao, it.nome, it.total]); });
            L.push([s.nome, s.lotacao, 'TOTAL DO PERÍODO', s.total]);
            L.push([s.nome, s.lotacao, 'TOTAL GERAL DO ANO DE REFERÊNCIA (' + u.anoRef + ')', s.totalAnoRef]);
            L.push([s.nome, s.lotacao, 'TOTAL GERAL DO MÊS DE REFERÊNCIA (' + MESES[u.mesRef] + '/' + u.anoRef + ')', s.totalMesRef]);
        });
        baixarCSV(L, 'relatorio_por_servidor_' + new Date().toISOString().slice(0, 10) + '.csv');
        avisar('Arquivo CSV gerado.');
    }

    var gerandoServ = false;
    async function gerarRelatorioServidorPDF() {
        if (gerandoServ || !exigeFiltroServidor()) return;
        if (typeof html2pdf === 'undefined') { avisar('Não foi possível carregar o gerador de PDF. Verifique sua conexão.'); return; }
        gerandoServ = true;
        avisar('Gerando relatório...');
        try {
            var u = ultimoServidor;
            var refTxt = MESES[u.mesRef] + '/' + u.anoRef;
            var h = cabecalho('Relatório por Servidor', [
                ['Período', u.periodo], ['Mês de referência', refTxt], ['Gerado em', agora()]
            ]);
            if (u.filtroAtiv.length) h += '<div class="rel-subtitulo" style="margin-top:-6px;">Atividades filtradas: ' + esc(u.filtroAtiv.join(', ')) + '</div>';

            if (u.servidores.length > 1) {
                var totG = u.servidores.reduce(function (s, x) { return s + x.total; }, 0);
                h += '<div class="rel-bloco"><div class="rel-secao">Visão geral</div>' +
                     '<div class="rel-subtitulo">Comparativo entre os servidores selecionados</div>' +
                     '<table class="rel-tab"><thead><tr><th style="width:40%">Servidor / Colaborador</th><th class="n">Total do período</th><th class="n">% do período</th><th class="n">Ano ' + u.anoRef + '</th><th class="n">' + esc(refTxt) + '</th></tr></thead><tbody>';
                u.servidores.forEach(function (s) {
                    h += '<tr><td>' + esc(s.nome) + '</td><td class="n"><b>' + num(s.total) + '</b></td><td class="n">' + pct(s.total, totG) +
                         '</td><td class="n">' + num(s.totalAnoRef) + '</td><td class="n">' + num(s.totalMesRef) + '</td></tr>';
                });
                h += '<tr class="rel-total"><td>TOTAL</td><td class="n">' + num(totG) + '</td><td class="n">100,0%</td><td class="n">' +
                     num(u.servidores.reduce(function (s, x) { return s + x.totalAnoRef; }, 0)) + '</td><td class="n">' +
                     num(u.servidores.reduce(function (s, x) { return s + x.totalMesRef; }, 0)) + '</td></tr></tbody></table>';
                var ord = u.servidores.slice().sort(function (a, b) { return b.total - a.total; });
                var rg = [];
                rg.push(u.servidores.length + ' servidores · total do período: <b>' + num(totG) + '</b> atividades.');
                rg.push('Maior volume no período: <b>' + esc(ord[0].nome) + '</b> (' + num(ord[0].total) + ', ' + pct(ord[0].total, totG) + ').');
                rg.push('Menor volume no período: ' + esc(ord[ord.length - 1].nome) + ' (' + num(ord[ord.length - 1].total) + ').');
                rg.push('Média por servidor: <b>' + num(totG / u.servidores.length) + '</b> atividades no período.');
                h += linhas(rg) + '</div>';
            }

            u.servidores.forEach(function (s) {
                h += '<div class="rel-bloco"><div class="rel-secao">' + esc(s.nome) + '</div>' +
                     '<div class="rel-subtitulo">Lotação: ' + esc(s.lotacao || '—') + '</div>' +
                     '<table class="rel-tab"><thead><tr><th style="width:70%">Atividade</th><th class="n">Total</th><th class="n">% do período</th></tr></thead><tbody>';
                s.itens.forEach(function (it) {
                    h += '<tr><td>' + esc(it.nome) + '</td><td class="n">' + num(it.total) + '</td><td class="n">' + pct(it.total, s.total) + '</td></tr>';
                });
                if (!s.itens.length) h += '<tr><td colspan="3" style="color:#6B7280;text-align:center;">Nenhum registro no período.</td></tr>';
                h += '<tr class="rel-total"><td>TOTAL DO PERÍODO</td><td class="n">' + num(s.total) + '</td><td class="n">' + (s.total ? '100,0%' : '—') + '</td></tr>' +
                     '<tr class="rel-total"><td>TOTAL GERAL DO ANO DE REFERÊNCIA (' + u.anoRef + ')</td><td class="n">' + num(s.totalAnoRef) + '</td><td></td></tr>' +
                     '<tr class="rel-total"><td>TOTAL GERAL DO MÊS DE REFERÊNCIA (' + esc(refTxt) + ')</td><td class="n">' + num(s.totalMesRef) + '</td><td></td></tr>' +
                     '</tbody></table>';
                var r = [];
                r.push('Total no período: <b>' + num(s.total) + '</b> atividades em ' + s.itens.length + ' tipo(s) de atividade.');
                if (s.itens.length) {
                    r.push('Principal atividade: <b>' + esc(s.itens[0].nome) + '</b> (' + num(s.itens[0].total) + ', ' + pct(s.itens[0].total, s.total) + ').');
                    if (s.itens.length >= 3) {
                        r.push('As 3 principais atividades concentram <b>' + pct(s.itens[0].total + s.itens[1].total + s.itens[2].total, s.total) + '</b> do total.');
                    }
                    var ks = Object.keys(s.meses).sort();
                    if (ks.length) {
                        var mk = ks.reduce(function (a, b) { return s.meses[b] > s.meses[a] ? b : a; });
                        r.push('Mês de maior volume: <b>' + MESES[parseInt(mk.slice(5, 7), 10) - 1] + '/' + mk.slice(0, 4) + '</b> (' + num(s.meses[mk]) + ').');
                    }
                    r.push('Média mensal no período: <b>' + num(s.total / Math.max(1, u.nMeses)) + '</b>.');
                }
                r.push('Ano de referência (' + u.anoRef + '): <b>' + num(s.totalAnoRef) + '</b> · mês de referência (' + esc(refTxt) + '): <b>' + num(s.totalMesRef) + '</b>.');
                h += linhas(r) + '</div>';
            });
            h += rodape();
            await gerarPDF(h, 'Relatorio_por_Servidor_' + new Date().toISOString().slice(0, 10) + '.pdf');
            avisar('Relatório gerado com sucesso!');
        } catch (e) {
            console.error('Relatório por servidor:', e);
            avisar('Erro ao gerar o relatório. Tente novamente.');
        } finally {
            gerandoServ = false;
        }
    }

    function limparFiltrosRelatorioServidor() {
        document.querySelectorAll('#multiSelectServidoresRelatorio .pill-item.selecionado, #multiSelectAtividadesRelatorio .pill-item.selecionado')
            .forEach(function (c) { c.classList.remove('selecionado'); });
        ['dropdownServidoresRelatorio', 'dropdownAtividadesRelatorio'].forEach(function (id) {
            var d = document.getElementById(id);
            if (d && typeof atualizarLabelDropdown === 'function') atualizarLabelDropdown(d);
        });
        var ano = (typeof ANO_ATUAL !== 'undefined') ? ANO_ATUAL : String(new Date().getFullYear());
        var set = function (id, v) { var e = document.getElementById(id); if (e) e.value = v; };
        set('selectAnoDeServidorRelatorio', ano); set('selectAnoAteServidorRelatorio', ano);
        set('selectMesDeServidorRelatorio', 0); set('selectMesAteServidorRelatorio', 11);
        ultimoServidor = null;
        var c = document.getElementById('containerRelatorioServidor');
        if (c) c.innerHTML = '<div style="text-align:center; padding:40px; color:#888;">Selecione ao menos um servidor e clique em Filtrar.</div>';
    }

    window.renderizarResumoAnaliticoMulti = renderizarResumoAnaliticoMulti;
    window.gerarRelatorioAnalitico = gerarRelatorioAnalitico;
    window.filtrarRelatorioServidor = filtrarRelatorioServidor;
    window.exportarCSVServidor = exportarCSVServidor;
    window.gerarRelatorioServidorPDF = gerarRelatorioServidorPDF;
    window.limparFiltrosRelatorioServidor = limparFiltrosRelatorioServidor;
})();
