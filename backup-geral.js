// ============================================================
// SEATE - backup-geral.js
// Botão "Backup Geral" (somente na tela Estatística, com login).
// Gera dois arquivos de Excel, com a MESMA APARÊNCIA das tabelas do
// sistema, para guardar fora do sistema e, se o banco tiver algum
// problema, permitir realimentar os números:
//   1) SEATE_Backup_Atividades_AAAA-MM-DD.xlsx
//      - Resumo; uma aba por ano (igual à janela do ano: setores,
//        Jan..Dez, TOTAL, meses dos registros em cinza, Total Mensal
//        Combinado, variação e TOTAL GERAL);
//      - "Dados digitados (original)" (tabela dados_historicos inteira);
//      - "Atividades cadastradas".
//   2) SEATE_Backup_Servidores_AAAA-MM-DD.xlsx
//      - Resumo; uma aba por servidor (atividades mês a mês por ano e
//        dias com status);
//      - "Detalhe diário" (tabela registros, uma linha por dia/atividade);
//      - "Servidores cadastrados".
// Biblioteca: xlsx-js-style (SheetJS com formatação), carregada só
// quando o botão é clicado.
// ============================================================
(function () {
    'use strict';

    var XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';
    var MES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
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
        if (typeof XLSX !== 'undefined' && XLSX.utils && XLSX.writeFile) return Promise.resolve();
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

    // ------------------------------------------------------------------
    // Estilos (cores da tela)
    // ------------------------------------------------------------------
    var COR = { marinho: '0F2D52', azul: '1E4A72', cinzaCab: 'F1F3F5', herdado: 'EEF2F6', textoHerdado: '5A6B7A',
                laranja: 'F6B44B', cinzaTot: 'E9EDF2', amarelo: 'FFF3CD', verde: '15803D', vermelho: 'B91C1C', borda: 'D9DEE5' };
    var BORDA = { top: { style: 'thin', color: { rgb: COR.borda } }, bottom: { style: 'thin', color: { rgb: COR.borda } },
                  left: { style: 'thin', color: { rgb: COR.borda } }, right: { style: 'thin', color: { rgb: COR.borda } } };
    function est(o) {
        o = o || {};
        var s = { font: { name: 'Calibri', sz: o.sz || 10, bold: !!o.bold, color: { rgb: o.cor || '1F2937' } },
                  alignment: { horizontal: o.al || 'left', vertical: 'center', wrapText: !!o.quebra },
                  border: o.semBorda ? {} : BORDA };
        if (o.fundo) s.fill = { patternType: 'solid', fgColor: { rgb: o.fundo } };
        return s;
    }
    var S = {
        titulo: est({ bold: true, sz: 13, cor: 'FFFFFF', fundo: COR.marinho, semBorda: true }),
        sub: est({ sz: 9, cor: '475569', semBorda: true }),
        faixa: est({ bold: true, sz: 11, cor: 'FFFFFF', fundo: COR.azul, al: 'center' }),
        cab: est({ bold: true, cor: '334155', fundo: COR.cinzaCab }),
        cabNum: est({ bold: true, cor: '334155', fundo: COR.cinzaCab, al: 'center' }),
        cabTotal: est({ bold: true, cor: COR.marinho, fundo: COR.laranja, al: 'center' }),
        ativ: est({ cor: COR.marinho, quebra: true }),
        num: est({ al: 'center' }),
        numHerdado: est({ al: 'center', cor: COR.textoHerdado, fundo: COR.herdado }),
        numTotal: est({ al: 'center', bold: true, cor: COR.azul, fundo: COR.cinzaTot }),
        totRot: est({ bold: true, cor: COR.marinho, fundo: COR.cinzaTot }),
        totNum: est({ bold: true, al: 'center', fundo: COR.cinzaTot }),
        totDest: est({ bold: true, al: 'center', cor: COR.marinho, fundo: COR.laranja }),
        combRot: est({ bold: true, cor: COR.marinho, fundo: COR.amarelo }),
        combNum: est({ bold: true, al: 'center', fundo: COR.amarelo }),
        varRot: est({ sz: 9, cor: '475569' }),
        varNum: est({ sz: 9, al: 'center', cor: '475569' }),
        varSobe: est({ sz: 9, al: 'center', cor: COR.verde }),
        varDesce: est({ sz: 9, al: 'center', cor: COR.vermelho }),
        geral: est({ bold: true, sz: 12, cor: COR.marinho, fundo: COR.laranja, al: 'center' }),
        nota: est({ sz: 9, cor: '555555', semBorda: true, quebra: true }),
        lista: est({}),
        listaNum: est({ al: 'right' })
    };
    var FMT = '#,##0';

    // Construtor de abas com formatação: cada célula é {v, s, z} ou vazia.
    function Aba(nCols) { this.l = []; this.m = []; this.alturas = []; this.nCols = nCols; }
    Aba.prototype.linha = function (cells, altura) { this.l.push(cells || []); this.alturas.push(altura || null); return this.l.length - 1; };
    Aba.prototype.faixa = function (texto, estilo, altura) {
        var r = this.linha([{ v: texto, s: estilo }].concat(Array(this.nCols - 1).fill({ v: '', s: estilo })), altura);
        this.m.push({ s: { r: r, c: 0 }, e: { r: r, c: this.nCols - 1 } });
    };
    Aba.prototype.vazia = function () { this.linha([]); };
    Aba.prototype.planilha = function (larguras) {
        var dados = this.l.map(function (r) { return r.map(function (c) { return (c && typeof c === 'object') ? c.v : c; }); });
        var ws = XLSX.utils.aoa_to_sheet(dados);
        var self = this;
        this.l.forEach(function (r, i) {
            r.forEach(function (c, j) {
                if (!c || typeof c !== 'object') return;
                var ref = XLSX.utils.encode_cell({ r: i, c: j });
                if (!ws[ref]) ws[ref] = { t: 's', v: '' };
                if (c.s) ws[ref].s = c.s;
                if (typeof c.v === 'number') { ws[ref].t = 'n'; ws[ref].z = c.z || FMT; }
            });
        });
        ws['!merges'] = this.m;
        if (larguras) ws['!cols'] = larguras.map(function (w) { return { wch: w }; });
        ws['!rows'] = this.alturas.map(function (h) { return h ? { hpt: h } : null; });
        return ws;
    };
    function nomeAba(nome, usados) {
        var base = String(nome || 'Aba').replace(/[:\\\/\?\*\[\]]/g, ' ').trim().slice(0, 31) || 'Aba';
        var n = base, i = 2;
        while (usados[n.toLowerCase()]) { var suf = ' (' + i++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
        usados[n.toLowerCase()] = true;
        return n;
    }
    function anexar(wb, ws, nome, usados) { XLSX.utils.book_append_sheet(wb, ws, nomeAba(nome, usados)); }
    var LARG_MENSAL = [46].concat(MES_CURTO.map(function () { return 9; }), [11]);

    // Lista simples (para recuperação), com cabeçalho colorido
    function abaLista(cabecalho, linhas, larguras) {
        var a = new Aba(cabecalho.length);
        a.linha(cabecalho.map(function (c) { return { v: c, s: S.cab }; }));
        linhas.forEach(function (l) { a.linha(l.map(function (v) { return { v: v === undefined || v === null ? '' : v, s: typeof v === 'number' ? S.listaNum : S.lista, z: '0' }; })); });
        return a.planilha(larguras);
    }

    async function lerTudo(tabela, campos, ordenar) {
        var r = await _lerTodasPaginas(function (comOrdem) {
            var q = db.from(tabela).select(campos);
            return comOrdem ? ordenar(q) : q;
        });
        if (!r || r.error || !r.data) throw new Error('Falha ao ler ' + tabela + (r && r.error ? ': ' + r.error.message : ''));
        return r.data;
    }

    // Cabeçalho Atividade | Jan..Dez | TOTAL
    function cabecalhoMeses(a, rotulo) {
        a.linha([{ v: rotulo || 'Atividade', s: S.cab }].concat(MES_CURTO.map(function (m) { return { v: m, s: S.cabNum }; }), [{ v: 'TOTAL', s: S.cabTotal }]));
    }
    function linhaValores(a, rotulo, vals, cinza, estRot, estNum, estTot) {
        a.linha([{ v: rotulo, s: estRot || S.ativ }].concat(vals.map(function (v, i) {
            return { v: +v || 0, s: estNum || (cinza && cinza[i] ? S.numHerdado : S.num) };
        }), [{ v: soma(vals), s: estTot || S.numTotal }]));
    }

    // ------------------------------------------------------------------
    // 1) ATIVIDADES POR ANO (igual à janela do ano)
    // ------------------------------------------------------------------
    async function montarArquivoAtividades(dataMaisAntiga) {
        var T = getTables();
        var anos = getAnosDisponiveis().map(Number).sort(function (a, b) { return a - b; });
        var historico = await lerTudo(T.DADOS_HISTORICOS, 'ano, setor, atividade, mes, valor',
            function (q) { return q.order('ano').order('setor').order('atividade').order('mes'); });
        var atividadesCad = await lerTudo(T.ATIVIDADES, '*', function (q) { return q.order('nome'); });
        var listas = await Promise.all([obterAtividadesPorSetor('SEATE'), obterAtividadesPorSetor('NAHORA'), obterAtividadesPorSetor('DIGITALIZAÇÃO')]);
        if (listas[0] === null || listas[1] === null) throw new Error('Falha ao ler a lista de atividades');

        var wb = XLSX.utils.book_new(), usados = {};
        var resumoLinhas = [], abasAno = [];

        for (var k = 0; k < anos.length; k++) {
            var ano = anos[k], anoTxt = String(ano);
            var manual = { SEATE: {}, NAHORA: {} };
            historico.forEach(function (h) {
                if (String(h.ano) !== anoTxt || !manual[h.setor]) return;
                if (!manual[h.setor][h.atividade]) manual[h.setor][h.atividade] = {};
                manual[h.setor][h.atividade][h.mes] = (+manual[h.setor][h.atividade][h.mes] || 0) + (+h.valor || 0);
            });
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
            var comDigit = anoUsaRegistros(anoTxt) && Object.keys(digit).length > 0;
            var dez = null;
            try { dez = await totalDezembroDoAno(ano - 1); } catch (eDz) { dez = null; }

            var a = new Aba(14);
            a.faixa('Dados Estatísticos - ' + anoTxt + ' - SEATE + NAHORA' + (comDigit ? ' + DIGITALIZAÇÃO' : '') + ' (Mensal)', S.titulo, 24);
            a.linha([{ v: 'Gerado em ' + new Date().toLocaleString('pt-BR') + (herdado.some(Boolean) ? ' — meses em cinza vêm dos registros dos servidores; os demais foram digitados.' : ' — dados digitados.'), s: S.sub }]);
            a.vazia();
            var totMesSetor = {}, totalSetor = {};
            var setores = [['SEATE', listas[0], manual.SEATE, false], ['NAHORA', listas[1], manual.NAHORA, false]];
            if (comDigit) setores.push(['DIGITALIZAÇÃO', listas[2] || [], digit, true]);
            setores.forEach(function (st) {
                var lista = (st[1] || []).slice();
                Object.keys(st[2]).sort(ordenarPt).forEach(function (n) { if (lista.indexOf(n) === -1) lista.push(n); });
                var cinza = st[3] ? MESES_CHAVE.map(function () { return true; }) : herdado;
                var tm = MESES_CHAVE.map(function () { return 0; });
                a.faixa('📍 ' + st[0], S.faixa, 20);
                cabecalhoMeses(a);
                lista.forEach(function (n) {
                    var vals = MESES_CHAVE.map(function (mk) { return +((st[2][n] || {})[mk]) || 0; });
                    vals.forEach(function (v, i) { tm[i] += v; });
                    linhaValores(a, n, vals, cinza);
                });
                linhaValores(a, 'TOTAL ' + st[0], tm, null, S.totRot, S.totNum, S.totDest);
                a.vazia();
                totMesSetor[st[0]] = tm; totalSetor[st[0]] = soma(tm);
            });
            var comb = MESES_CHAVE.map(function (mk, i) { return Object.keys(totMesSetor).reduce(function (x, s) { return x + totMesSetor[s][i]; }, 0); });
            cabecalhoMeses(a, 'SEATE + NAHORA' + (comDigit ? ' + DIGITALIZAÇÃO' : ''));
            linhaValores(a, 'Total Mensal Combinado', comb, null, S.combRot, S.combNum, S.totDest);
            a.linha([{ v: 'Variação vs mês anterior', s: S.varRot }].concat(comb.map(function (v, i) {
                var ant = i > 0 ? comb[i - 1] : dez, txt = '–', es = S.varNum;
                if (ant !== null && ant !== undefined && (v || ant)) {
                    var x = variacaoMesAnterior(v, ant);
                    if (x !== 'sem base de comparação' && x !== 'sem dados no mês') {
                        txt = x; es = x.charAt(0) === '▲' ? S.varSobe : (x.charAt(0) === '▼' ? S.varDesce : S.varNum);
                    }
                }
                return { v: txt, s: es };
            }), [{ v: '', s: S.varNum }]));
            a.vazia();
            a.faixa('TOTAL GERAL ' + anoTxt + (comDigit ? ' (SEATE + NAHORA + DIGITALIZAÇÃO)' : ' (SEATE + NAHORA)') + ': ' + soma(comb).toLocaleString('pt-BR'), S.geral, 22);
            abasAno.push([a.planilha(LARG_MENSAL), anoTxt]);
            resumoLinhas.push([anoTxt, totalSetor.SEATE || 0, totalSetor.NAHORA || 0, totalSetor['DIGITALIZAÇÃO'] || 0, soma(comb)]);
        }

        var r = new Aba(5);
        r.faixa('SEATE — Backup de atividades por ano', S.titulo, 24);
        r.linha([{ v: 'Gerado em ' + new Date().toLocaleString('pt-BR'), s: S.sub }]);
        r.vazia();
        r.linha(['Ano', 'SEATE', 'NAHORA', 'DIGITALIZAÇÃO', 'TOTAL'].map(function (c, i) { return { v: c, s: i === 4 ? S.cabTotal : (i ? S.cabNum : S.cab) }; }));
        resumoLinhas.forEach(function (l) { r.linha([{ v: l[0], s: S.ativ }, { v: l[1], s: S.num }, { v: l[2], s: S.num }, { v: l[3], s: S.num }, { v: l[4], s: S.numTotal }]); });
        var tg = [1, 2, 3, 4].map(function (i) { return soma(resumoLinhas.map(function (l) { return l[i]; })); });
        r.linha([{ v: 'TOTAL GERAL', s: S.totRot }, { v: tg[0], s: S.totNum }, { v: tg[1], s: S.totNum }, { v: tg[2], s: S.totNum }, { v: tg[3], s: S.totDest }]);
        anexar(wb, r.planilha([18, 12, 12, 16, 13]), 'Resumo', usados);
        abasAno.forEach(function (x) { anexar(wb, x[0], x[1], usados); });
        anexar(wb, abaLista(['ano', 'setor', 'atividade', 'mes', 'valor'],
            historico.map(function (h) { return [String(h.ano), h.setor, h.atividade, h.mes, +h.valor || 0]; }), [8, 16, 50, 12, 10]),
            'Dados digitados (original)', usados);
        anexar(wb, abaLista(['nome', 'setor', 'ordem'],
            atividadesCad.map(function (x) { return [x.nome, x.setor || '', x.ordem == null ? '' : x.ordem]; }), [50, 16, 8]),
            'Atividades cadastradas', usados);
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

        var porServ = {}, detalhe = [];
        regs.forEach(function (r) {
            var nome = r.servidores ? r.servidores.nome : '(servidor removido)';
            var lot = r.servidores ? (r.servidores.lotacao || '') : '';
            var ano = String(r.data).slice(0, 4), mi = parseInt(String(r.data).slice(5, 7), 10) - 1;
            var st = String(r.ausencia || '').trim();
            if (!porServ[nome]) porServ[nome] = { nome: nome, lotacao: lot, anos: {} };
            var Sv = porServ[nome];
            if (!Sv.anos[ano]) Sv.anos[ano] = { ativ: {}, status: {} };
            var at = r.atividades || {}, teveLinha = false;
            Object.keys(at).sort(ordenarPt).forEach(function (a) {
                var q = +at[a] || 0;
                if (!q) return;
                if (!Sv.anos[ano].ativ[a]) Sv.anos[ano].ativ[a] = MES_CURTO.map(function () { return 0; });
                Sv.anos[ano].ativ[a][mi] += q;
                detalhe.push([nome, lot, r.data, a, q, nomeStatus(st)]);
                teveLinha = true;
            });
            if (st) {
                if (!Sv.anos[ano].status[st]) Sv.anos[ano].status[st] = MES_CURTO.map(function () { return 0; });
                Sv.anos[ano].status[st][mi]++;
                if (!teveLinha) detalhe.push([nome, lot, r.data, '', '', nomeStatus(st)]);
            }
        });

        var wb = XLSX.utils.book_new(), usados = {};
        var nomes = Object.keys(porServ).sort(ordenarPt);

        var r = new Aba(4);
        r.faixa('SEATE — Backup por servidor (registros diários)', S.titulo, 24);
        r.linha([{ v: 'Gerado em ' + new Date().toLocaleString('pt-BR'), s: S.sub }]);
        r.vazia();
        r.linha(['Servidor / Colaborador', 'Lotação', 'Ano', 'TOTAL'].map(function (c, i) { return { v: c, s: i === 3 ? S.cabTotal : S.cab }; }));
        nomes.forEach(function (n) {
            Object.keys(porServ[n].anos).sort().forEach(function (ano) {
                var A = porServ[n].anos[ano];
                r.linha([{ v: n, s: S.ativ }, { v: porServ[n].lotacao, s: S.lista }, { v: ano, s: S.num },
                         { v: soma(Object.keys(A.ativ).map(function (x) { return soma(A.ativ[x]); })), s: S.numTotal }]);
            });
        });
        anexar(wb, r.planilha([36, 18, 8, 13]), 'Resumo', usados);

        nomes.forEach(function (n) {
            var Sv = porServ[n], a = new Aba(14);
            a.faixa(n + ' — ' + (Sv.lotacao || 'sem lotação'), S.titulo, 24);
            a.vazia();
            Object.keys(Sv.anos).sort().forEach(function (ano) {
                var A = Sv.anos[ano];
                a.faixa('📍 ' + ano, S.faixa, 20);
                cabecalhoMeses(a);
                var tm = MES_CURTO.map(function () { return 0; });
                Object.keys(A.ativ).sort(ordenarPt).forEach(function (x) {
                    A.ativ[x].forEach(function (v, i) { tm[i] += v; });
                    linhaValores(a, x, A.ativ[x]);
                });
                linhaValores(a, 'TOTAL ' + ano, tm, null, S.totRot, S.totNum, S.totDest);
                var sts = Object.keys(A.status).sort(ordenarPt);
                if (sts.length) {
                    cabecalhoMeses(a, 'Dias com status');
                    sts.forEach(function (s) { linhaValores(a, nomeStatus(s), A.status[s], null, S.ativ, S.num, S.numTotal); });
                }
                a.vazia();
            });
            anexar(wb, a.planilha(LARG_MENSAL), n, usados);
        });

        anexar(wb, abaLista(['servidor', 'lotacao', 'data', 'atividade', 'quantidade', 'status'], detalhe, [36, 18, 12, 50, 11, 12]), 'Detalhe diário', usados);
        anexar(wb, abaLista(['nome', 'lotacao', 'ativo', 'ordem'],
            servCad.map(function (s) { return [s.nome, s.lotacao || '', s.ativo === false ? 'não' : 'sim', s.ordem == null ? '' : s.ordem]; }), [36, 18, 8, 8]),
            'Servidores cadastrados', usados);
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
