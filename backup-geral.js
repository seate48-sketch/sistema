// ============================================================
// SEATE - backup-geral.js
// Botão "Backup Geral" (somente na tela Estatística, com login).
// Gera dois arquivos de Excel para guardar fora do sistema e, se o
// banco tiver algum problema, permitir realimentar os números:
//   1) SEATE_Backup_Atividades_AAAA-MM-DD.xlsx
//      - uma aba por ano: atividades por setor, mês a mês, com a
//        origem de cada mês (digitado / registros) e os totais;
//      - "Dados digitados (original)": tabela dados_historicos inteira;
//      - "Atividades cadastradas".
//   2) SEATE_Backup_Servidores_AAAA-MM-DD.xlsx
//      - uma aba por servidor: atividades mês a mês (por ano) e dias
//        com status;
//      - "Detalhe diário": uma linha por servidor/dia/atividade (tabela
//        registros), com o status do dia;
//      - "Servidores cadastrados".
// Usa a biblioteca SheetJS (xlsx), carregada só quando o botão é clicado.
// ============================================================
(function () {
    'use strict';

    var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var MESES_CHAVE = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var gerando = false;
    var _xlsxPromise = null;

    function avisar(msg) { if (typeof feedback === 'function') feedback(msg); else console.log(msg); }
    function p2(n) { return String(n).padStart(2, '0'); }
    function hojeISO() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
    function soma(arr) { return arr.reduce(function (x, y) { return x + (+y || 0); }, 0); }
    function ordenarPt(a, b) { return String(a).localeCompare(String(b), 'pt-BR'); }
    function nomeStatus(s) { return s === 'Ferias' ? 'Férias' : s; }

    function carregarXLSX() {
        if (typeof XLSX !== 'undefined') return Promise.resolve();
        if (_xlsxPromise) return _xlsxPromise;
        _xlsxPromise = new Promise(function (ok, falha) {
            var s = document.createElement('script');
            s.src = XLSX_URL;
            s.onload = function () { ok(); };
            s.onerror = function () { _xlsxPromise = null; falha(new Error('Biblioteca de Excel indisponível')); };
            document.head.appendChild(s);
        });
        return _xlsxPromise;
    }

    // nomes de abas: até 31 caracteres, sem : \ / ? * [ ] e sem repetir
    function nomeAba(nome, usados) {
        var base = String(nome || 'Aba').replace(/[:\\\/\?\*\[\]]/g, ' ').trim().slice(0, 31) || 'Aba';
        var n = base, i = 2;
        while (usados[n.toLowerCase()]) { var suf = ' (' + i++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
        usados[n.toLowerCase()] = true;
        return n;
    }
    function adicionarAba(wb, linhas, nome, usados, larguras) {
        var ws = XLSX.utils.aoa_to_sheet(linhas);
        if (larguras) ws['!cols'] = larguras.map(function (w) { return { wch: w }; });
        XLSX.utils.book_append_sheet(wb, ws, nomeAba(nome, usados));
    }
    var LARG_MESES = [42].concat(MESES.map(function () { return 10; }), [11]);

    async function lerTudo(tabela, campos, ordenar) {
        var r = await _lerTodasPaginas(function (comOrdem) {
            var q = db.from(tabela).select(campos);
            return comOrdem ? ordenar(q) : q;
        });
        if (!r || r.error || !r.data) throw new Error('Falha ao ler ' + tabela + (r && r.error ? ': ' + r.error.message : ''));
        return r.data;
    }

    // ------------------------------------------------------------------
    // 1) ATIVIDADES POR ANO
    // ------------------------------------------------------------------
    async function montarArquivoAtividades(dataMaisAntiga) {
        var T = getTables();
        var anos = getAnosDisponiveis().map(Number).sort(function (a, b) { return a - b; });
        var historico = await lerTudo(T.DADOS_HISTORICOS, 'ano, setor, atividade, mes, valor',
            function (q) { return q.order('ano').order('setor').order('atividade').order('mes'); });
        var atividadesCad = await lerTudo(T.ATIVIDADES, '*', function (q) { return q.order('nome'); });

        var wb = XLSX.utils.book_new(), usados = {};
        var resumo = [['SEATE — Backup de atividades por ano'], ['Gerado em', new Date().toLocaleString('pt-BR')], [],
                      ['Ano', 'SEATE', 'NAHORA', 'DIGITALIZAÇÃO', 'Total']];
        var abasAno = [];

        for (var k = 0; k < anos.length; k++) {
            var ano = anos[k], anoTxt = String(ano);
            var manual = { SEATE: {}, NAHORA: {} };
            historico.forEach(function (h) {
                if (String(h.ano) !== anoTxt || !manual[h.setor]) return;
                if (!manual[h.setor][h.atividade]) manual[h.setor][h.atividade] = {};
                manual[h.setor][h.atividade][h.mes] = (+manual[h.setor][h.atividade][h.mes] || 0) + (+h.valor || 0);
            });
            // meses que vêm dos registros dos servidores (mesma regra da janela do ano)
            var herdado = MESES_CHAVE.map(function () { return false; });
            var digit = {};
            if (anoUsaRegistros(anoTxt)) {
                var corte = -1;
                if (dataMaisAntiga) {
                    var pt = dataMaisAntiga.split('-');
                    if (pt[0] === anoTxt) corte = parseInt(pt[1], 10) - 1;
                    else if (parseInt(pt[0], 10) < ano) corte = 0;
                }
                if (anoSoRegistros(anoTxt)) corte = 0;
                var t = await obterTotaisAno(anoTxt);
                if (!t || t.erro) throw new Error('Falha ao ler os registros de ' + anoTxt);
                if (corte >= 0) {
                    for (var mi = corte; mi < 12; mi++) herdado[mi] = true;
                    [['SEATE', t.porAtividadeMesSeate], ['NAHORA', t.porAtividadeMesNahora]].forEach(function (par) {
                        var reg = par[1] || {};
                        Object.keys(reg).forEach(function (a) {
                            if (!manual[par[0]][a]) manual[par[0]][a] = {};
                            MESES_CHAVE.forEach(function (mk, i) { if (herdado[i]) manual[par[0]][a][mk] = +reg[a][mk] || 0; });
                        });
                    });
                    var rd = t.porAtividadeMesDigit || {};
                    Object.keys(rd).forEach(function (a) {
                        digit[a] = {};
                        MESES_CHAVE.forEach(function (mk, i) { if (herdado[i]) digit[a][mk] = +rd[a][mk] || 0; });
                    });
                }
            }
            var origem = ['Origem do mês'].concat(herdado.map(function (h) { return h ? 'registros' : 'digitado'; }), ['']);
            var linhas = [['SEATE — Atividades ' + anoTxt + ' (mês a mês)'], origem, []];
            var totaisSetor = {}, totalMesGeral = MESES_CHAVE.map(function () { return 0; });
            [['SEATE', manual.SEATE], ['NAHORA', manual.NAHORA], ['DIGITALIZAÇÃO', digit]].forEach(function (st) {
                var nomes = Object.keys(st[1]).sort(ordenarPt);
                var totMes = MESES_CHAVE.map(function () { return 0; });
                var corpo = [];
                nomes.forEach(function (a) {
                    var vals = MESES_CHAVE.map(function (mk) { return +((st[1][a] || {})[mk]) || 0; });
                    if (!soma(vals)) return;
                    vals.forEach(function (v, i) { totMes[i] += v; });
                    corpo.push([a].concat(vals, [soma(vals)]));
                });
                totaisSetor[st[0]] = soma(totMes);
                if (!corpo.length) return;
                totMes.forEach(function (v, i) { totalMesGeral[i] += v; });
                linhas.push([st[0]]);
                linhas.push(['Atividade'].concat(MESES, ['Total']));
                corpo.forEach(function (l) { linhas.push(l); });
                linhas.push(['TOTAL ' + st[0]].concat(totMes, [soma(totMes)]));
                linhas.push([]);
            });
            linhas.push(['TOTAL GERAL ' + anoTxt].concat(totalMesGeral, [soma(totalMesGeral)]));
            abasAno.push([linhas, anoTxt]);
            resumo.push([anoTxt, totaisSetor.SEATE || 0, totaisSetor.NAHORA || 0, totaisSetor['DIGITALIZAÇÃO'] || 0, soma(totalMesGeral)]);
        }

        adicionarAba(wb, resumo, 'Resumo', usados, [16, 12, 12, 16, 12]);
        abasAno.forEach(function (a) { adicionarAba(wb, a[0], a[1], usados, LARG_MESES); });
        var orig = [['ano', 'setor', 'atividade', 'mes', 'valor']].concat(historico.map(function (h) { return [String(h.ano), h.setor, h.atividade, h.mes, +h.valor || 0]; }));
        adicionarAba(wb, orig, 'Dados digitados (original)', usados, [8, 16, 48, 12, 10]);
        var cad = [['nome', 'setor', 'ordem']].concat(atividadesCad.map(function (a) { return [a.nome, a.setor || '', a.ordem == null ? '' : a.ordem]; }));
        adicionarAba(wb, cad, 'Atividades cadastradas', usados, [48, 16, 8]);
        return wb;
    }

    // ------------------------------------------------------------------
    // 2) SERVIDORES MÊS A MÊS + DETALHE DIÁRIO
    // ------------------------------------------------------------------
    async function montarArquivoServidores() {
        var T = getTables();
        var regs = await lerTudo(T.REGISTROS, 'data, atividades, ausencia, servidores(nome, lotacao)',
            function (q) { return q.order('data').order('servidor_id'); });
        var servCad = await lerTudo(T.SERVIDORES, '*', function (q) { return q.order('nome'); });

        var porServ = {}, detalhe = [['servidor', 'lotacao', 'data', 'atividade', 'quantidade', 'status']];
        regs.forEach(function (r) {
            var nome = r.servidores ? r.servidores.nome : '(servidor removido)';
            var lot = r.servidores ? (r.servidores.lotacao || '') : '';
            var ano = String(r.data).slice(0, 4), mi = parseInt(String(r.data).slice(5, 7), 10) - 1;
            var st = String(r.ausencia || '').trim();
            if (!porServ[nome]) porServ[nome] = { nome: nome, lotacao: lot, anos: {} };
            var S = porServ[nome];
            if (!S.anos[ano]) S.anos[ano] = { ativ: {}, status: {} };
            var at = r.atividades || {}, teveLinha = false;
            Object.keys(at).sort(ordenarPt).forEach(function (a) {
                var q = +at[a] || 0;
                if (!q) return;
                if (!S.anos[ano].ativ[a]) S.anos[ano].ativ[a] = MESES.map(function () { return 0; });
                S.anos[ano].ativ[a][mi] += q;
                detalhe.push([nome, lot, r.data, a, q, nomeStatus(st)]);
                teveLinha = true;
            });
            if (st) {
                if (!S.anos[ano].status[st]) S.anos[ano].status[st] = MESES.map(function () { return 0; });
                S.anos[ano].status[st][mi]++;
                if (!teveLinha) detalhe.push([nome, lot, r.data, '', '', nomeStatus(st)]);
            }
        });

        var wb = XLSX.utils.book_new(), usados = {};
        var nomes = Object.keys(porServ).sort(ordenarPt);
        var resumo = [['SEATE — Backup por servidor (registros diários)'], ['Gerado em', new Date().toLocaleString('pt-BR')], [],
                      ['Servidor', 'Lotação', 'Ano', 'Total lançado']];
        nomes.forEach(function (n) {
            Object.keys(porServ[n].anos).sort().forEach(function (ano) {
                var A = porServ[n].anos[ano];
                resumo.push([n, porServ[n].lotacao, ano, soma(Object.keys(A.ativ).map(function (a) { return soma(A.ativ[a]); }))]);
            });
        });
        adicionarAba(wb, resumo, 'Resumo', usados, [34, 16, 8, 14]);

        nomes.forEach(function (n) {
            var S = porServ[n], linhas = [[n + ' — ' + (S.lotacao || 'sem lotação')], []];
            Object.keys(S.anos).sort().forEach(function (ano) {
                var A = S.anos[ano];
                linhas.push(['Ano ' + ano]);
                linhas.push(['Atividade'].concat(MESES, ['Total']));
                var totMes = MESES.map(function () { return 0; });
                Object.keys(A.ativ).sort(ordenarPt).forEach(function (a) {
                    A.ativ[a].forEach(function (v, i) { totMes[i] += v; });
                    linhas.push([a].concat(A.ativ[a], [soma(A.ativ[a])]));
                });
                linhas.push(['TOTAL'].concat(totMes, [soma(totMes)]));
                var sts = Object.keys(A.status).sort(ordenarPt);
                if (sts.length) {
                    linhas.push(['Dias com status'].concat(MESES.map(function () { return ''; }), ['']));
                    sts.forEach(function (s) { linhas.push([nomeStatus(s)].concat(A.status[s], [soma(A.status[s])])); });
                }
                linhas.push([]);
            });
            adicionarAba(wb, linhas, n, usados, LARG_MESES);
        });

        adicionarAba(wb, detalhe, 'Detalhe diário', usados, [34, 16, 12, 48, 11, 12]);
        var cad = [['nome', 'lotacao', 'ativo', 'ordem']].concat(servCad.map(function (s) {
            return [s.nome, s.lotacao || '', s.ativo === false ? 'não' : 'sim', s.ordem == null ? '' : s.ordem];
        }));
        adicionarAba(wb, cad, 'Servidores cadastrados', usados, [34, 16, 8, 8]);
        return wb;
    }

    async function gerarBackupGeral() {
        if (gerando) return;
        if (typeof db === 'undefined' || !db || typeof _lerTodasPaginas !== 'function') {
            avisar('Sem conexão com o banco de dados. Tente novamente.');
            return;
        }
        gerando = true;
        var btn = document.getElementById('btnBackupGeral');
        if (btn) { btn.disabled = true; btn.textContent = 'Gerando backup...'; }
        avisar('Gerando backup...');
        try {
            await carregarXLSX();
            var dataMaisAntiga = null;
            try { dataMaisAntiga = await dbCarregarDataMaisAntigaRegistro(); } catch (e) { dataMaisAntiga = null; }
            if (dataMaisAntiga === null) throw new Error('Falha ao ler o início dos registros');
            var wb1 = await montarArquivoAtividades(dataMaisAntiga);
            var wb2 = await montarArquivoServidores();
            var dia = hojeISO();
            XLSX.writeFile(wb1, 'SEATE_Backup_Atividades_' + dia + '.xlsx');
            await new Promise(function (ok) { setTimeout(ok, 600); }); // alguns navegadores bloqueiam dois downloads seguidos
            XLSX.writeFile(wb2, 'SEATE_Backup_Servidores_' + dia + '.xlsx');
            avisar('Backup gerado: 2 arquivos de Excel baixados.');
        } catch (e) {
            console.error('Backup geral:', e);
            avisar('Não foi possível gerar o backup (' + (e && e.message ? e.message : 'erro') + '). Verifique a conexão e tente novamente.');
        } finally {
            gerando = false;
            if (btn) { btn.disabled = false; btn.textContent = 'Backup Geral'; }
        }
    }

    window.gerarBackupGeral = gerarBackupGeral;
})();
