// ============================================================
// SEATE - Relatório Estatístico em PDF (botão "Gerar Relatório PDF")
// ============================================================
// Usado por estatistica.html e dashboard.html (as duas páginas ficam
// sempre iguais). Conteúdo:
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
})();
