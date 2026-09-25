// ============================================================
// SEATE - Entrega obrigatória do relatório mensal (página registro.html)
// ============================================================
// * Botão "Entregar relatório": o servidor escolhe o mês (atual ou
//   anteriores) e o relatório é enviado ao gestor — sem pré-visualização,
//   só a mensagem de envio concluído. Pode reenviar: a nova entrega
//   substitui a anterior com os dados atualizados.
// * Cobrança: o relatório do mês anterior deve ser entregue até o dia 5.
//   Depois disso, no primeiro dia útil em que o servidor esteja "Ativo",
//   aparece o aviso (ao abrir o sistema, às 11h e às 17h). Às 17h do dia
//   útil seguinte, o acesso é bloqueado; a tela de bloqueio traz o botão
//   para gerar o relatório, e ao gerar o servidor é desbloqueado.
// * Quem decide aviso/bloqueio é o banco (função situacao_entrega), pelo
//   relógio de Brasília do servidor de banco — não pelo relógio do
//   computador do servidor.
// Requer o script SQL 12_relatorios_entregues.sql no Supabase.
// ============================================================

(function () {
    'use strict';

    var MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    var HORARIOS_AVISO = [11, 17];
    var TEXTO_AVISO = 'Percebi que até o momento você não gerou o registro do mês anterior. ' +
                      'Seu acesso será bloqueado em 24hs caso não efetue este procedimento.';

    var nome = null;
    var situacao = null;        // última resposta de situacao_entrega
    var difRelogio = 0;         // (hora de Brasília do banco) - (relógio local), em ms
    var carregadoEm = 0;        // hora de Brasília (ms "naive") em que a página abriu
    var avisosMostrados = {};   // 'AAAA-MM-DD|11' → true
    var timer = null;
    var enviando = false;
    var preenchimento = null;   // { ano, mes, dias[], mesOrig, anoOrig } enquanto houver dias pendentes
    var DIAS_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

    // ---------------- utilitários ----------------
    function cliente() { return (typeof db !== 'undefined' && db && typeof db.rpc === 'function') ? db : null; }
    function avisar(msg) { if (typeof feedback === 'function') feedback(msg); else alert(msg); }
    function nomeMes(ano, mes) { return MESES[mes - 1] + '/' + ano; }
    function pad2(n) { return String(n).padStart(2, '0'); }
    // "agora" em horário de Brasília, como número (ms) lido em UTC
    function agoraBrasilia() { return Date.now() + difRelogio; }
    function dataHoje() { var d = new Date(agoraBrasilia()); return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()); }
    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // ---------------- estilos e elementos ----------------
    function montarInterface() {
        var st = document.createElement('style');
        st.textContent = [
            '.entrega-btn{background:var(--branco);color:var(--azul-marinho);border:1px solid var(--azul-institucional);padding:6px 14px;border-radius:30px;cursor:pointer;font-weight:600;font-size:0.75rem;margin-left:10px;transition:0.2s;}',
            '.entrega-btn:hover{background:var(--azul-institucional);color:var(--branco);}',
            '.entrega-overlay{display:none;position:fixed;inset:0;justify-content:center;align-items:center;padding:16px;backdrop-filter:blur(3px);}',
            '.entrega-overlay.aberto{display:flex;}',
            '#entregaAviso{z-index:10003;background:rgba(255,255,255,0.9);}',
            '#entregaBloqueio{z-index:10004;background:rgba(243,244,246,0.97);}',
            '#entregaEscolha{z-index:10005;background:rgba(0,0,0,0.45);}',
            '.entrega-caixa{background:var(--branco);border:2px solid var(--azul-institucional);border-radius:24px;padding:32px 40px;text-align:center;max-width:520px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.15);}',
            '.entrega-caixa h3{color:var(--azul-marinho);font-size:1.15rem;margin-bottom:14px;}',
            '.entrega-caixa p{color:var(--azul-marinho);font-size:1.02rem;line-height:1.5;margin-bottom:10px;}',
            '.entrega-caixa .entrega-ref{font-size:0.9rem;color:#4B5563;margin-bottom:22px;}',
            '.entrega-caixa select{width:100%;padding:10px 12px;border:1px solid var(--cinza-borda);border-radius:12px;font-size:0.95rem;margin:6px 0 20px;}',
            '.entrega-acoes{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;}',
            '.entrega-acoes button{border:none;border-radius:30px;padding:10px 22px;font-weight:600;font-size:0.9rem;cursor:pointer;}',
            '.entrega-principal{background:var(--azul-institucional);color:var(--branco);}',
            '.entrega-secundario{background:var(--cinza-claro);color:#333;}',
            '.entrega-acoes button:disabled{opacity:0.6;cursor:wait;}',
            '#entregaBloqueio .entrega-caixa{border-color:var(--perigo);}',
            '#entregaBloqueio h3{color:var(--perigo);}',
            '.calendar-day.entrega-pendente,.calendar-day.entrega-pendente:hover{background:#FFE3BF !important;box-shadow:inset 0 0 0 2px #F59E0B;}',
            '.entrega-faixa{background:#FFF7ED;border:2px solid #F59E0B;border-radius:16px;padding:14px 18px;margin-bottom:14px;color:#7C2D12;}',
            '.entrega-faixa h4{font-size:0.98rem;margin:0 0 6px;color:#9A3412;}',
            '.entrega-faixa p{font-size:0.86rem;line-height:1.45;margin:0 0 4px;}',
            '.entrega-faixa .entrega-acoes{justify-content:flex-start;margin-top:10px;}',
            '.entrega-faixa .entrega-acoes button{padding:8px 18px;font-size:0.82rem;}'
        ].join('\n');
        document.head.appendChild(st);

        var btnPerf = document.getElementById('btnDesempenho');
        if (btnPerf) {
            var btn = document.createElement('button');
            btn.id = 'btnEntregarRelatorio';
            btn.className = 'entrega-btn';
            btn.type = 'button';
            btn.textContent = 'Entregar relatório';
            btn.addEventListener('click', abrirEscolha);
            btnPerf.parentNode.insertBefore(btn, btnPerf.nextSibling);
        }

        var wrap = document.createElement('div');
        wrap.innerHTML =
            '<div id="entregaEscolha" class="entrega-overlay"><div class="entrega-caixa">' +
                '<h3>Entregar relatório</h3>' +
                '<p style="font-size:0.95rem;">Escolha o mês do relatório que será enviado ao gestor.</p>' +
                '<select id="entregaMes"></select>' +
                '<div class="entrega-acoes">' +
                    '<button type="button" class="entrega-secundario" id="entregaCancelar">Cancelar</button>' +
                    '<button type="button" class="entrega-principal" id="entregaEnviar">Enviar relatório</button>' +
                '</div>' +
            '</div></div>' +
            '<div id="entregaAviso" class="entrega-overlay"><div class="entrega-caixa">' +
                '<h3>Relatório mensal pendente</h3>' +
                '<p>' + esc(TEXTO_AVISO) + '</p>' +
                '<div class="entrega-ref" id="entregaAvisoRef"></div>' +
                '<div class="entrega-acoes">' +
                    '<button type="button" class="entrega-secundario" id="entregaAvisoOk">OK</button>' +
                    '<button type="button" class="entrega-principal" id="entregaAvisoGerar">Gerar relatório agora</button>' +
                '</div>' +
            '</div></div>' +
            '<div id="entregaBloqueio" class="entrega-overlay"><div class="entrega-caixa">' +
                '<h3>Acesso bloqueado</h3>' +
                '<p id="entregaBloqueioTexto"></p>' +
                '<div class="entrega-ref">Gere o relatório para liberar seu acesso automaticamente.</div>' +
                '<div class="entrega-acoes">' +
                    '<button type="button" class="entrega-principal" id="entregaBloqueioGerar">Gerar relatório</button>' +
                '</div>' +
            '</div></div>';
        while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

        document.getElementById('entregaCancelar').addEventListener('click', function () { fechar('entregaEscolha'); });
        document.getElementById('entregaEnviar').addEventListener('click', function () {
            var v = document.getElementById('entregaMes').value.split('-');
            tentarEntregar(+v[0], +v[1], 'entregaEnviar');
        });
        document.getElementById('entregaAvisoOk').addEventListener('click', function () { fechar('entregaAviso'); });
        document.getElementById('entregaAvisoGerar').addEventListener('click', function () {
            if (situacao) tentarEntregar(situacao.ano_ref, situacao.mes_ref, 'entregaAvisoGerar');
        });
        document.getElementById('entregaBloqueioGerar').addEventListener('click', function () {
            if (situacao) tentarEntregar(situacao.ano_ref, situacao.mes_ref, 'entregaBloqueioGerar');
        });
    }

    function abrir(id) { document.getElementById(id).classList.add('aberto'); }
    function fechar(id) { document.getElementById(id).classList.remove('aberto'); }

    // ---------------- escolha do mês ----------------
    function abrirEscolha() {
        var d = new Date(agoraBrasilia());
        var anoAtual = d.getUTCFullYear(), mesAtual = d.getUTCMonth() + 1;
        var meses = {};
        meses[anoAtual + '-' + pad2(mesAtual)] = true;
        var ant = new Date(Date.UTC(anoAtual, mesAtual - 2, 1));
        meses[ant.getUTCFullYear() + '-' + pad2(ant.getUTCMonth() + 1)] = true;
        try {
            if (typeof registros === 'object' && registros) {
                Object.keys(registros).forEach(function (k) {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) meses[k.slice(0, 7)] = true;
                });
            }
        } catch (e) {}
        var atual = anoAtual + '-' + pad2(mesAtual);
        var lista = Object.keys(meses).filter(function (k) { return k <= atual; }).sort().reverse();
        var sel = document.getElementById('entregaMes');
        sel.innerHTML = lista.map(function (k) {
            var p = k.split('-');
            return '<option value="' + (+p[0]) + '-' + (+p[1]) + '">' + nomeMes(+p[0], +p[1]) + '</option>';
        }).join('');
        // sugere o mês cobrado (anterior) quando ele ainda está pendente
        if (situacao && situacao.fase !== 'ok' && situacao.ano_ref) {
            sel.value = situacao.ano_ref + '-' + situacao.mes_ref;
        }
        abrir('entregaEscolha');
    }

    // ---------------- dias pendentes (mesma regra do banco) ----------------
    // Do último dia útil do mês para trás: dia com status diferente de
    // "Ativo" é pulado; dia "Ativo" sem atividades é pendente; para no
    // primeiro dia "Ativo" com atividades.
    function diasPendentes(ano, mes) {
        var regs = (typeof registros === 'object' && registros) ? registros : {};
        var pend = [];
        var ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
        for (var d = ultimo; d >= 1; d--) {
            var dow = new Date(Date.UTC(ano, mes - 1, d)).getUTCDay();
            if (dow === 0 || dow === 6) continue;
            var chave = ano + '-' + pad2(mes) + '-' + pad2(d);
            var reg = regs[chave];
            var aus = reg && !reg.example ? String(reg.ausencia || '').trim() : '';
            if (aus) continue;
            var total = 0;
            if (reg && !reg.example && reg.atividades) {
                Object.keys(reg.atividades).forEach(function (a) { total += (+reg.atividades[a] || 0); });
            }
            if (total > 0) break;
            pend.push(chave);
        }
        return pend.reverse();
    }

    function descreverDia(chave) {
        var p = chave.split('-');
        var dow = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay();
        return p[2] + '/' + p[1] + ' (' + DIAS_SEMANA[dow] + ')';
    }

    async function tentarEntregar(ano, mes, idBotao) {
        var pend = diasPendentes(ano, mes);
        if (pend.length) { entrarPreenchimento(ano, mes, pend); return; }
        await entregar(ano, mes, idBotao);
    }

    // mostra o calendário do mês do relatório com os dias pendentes em laranja
    function entrarPreenchimento(ano, mes, dias) {
        fechar('entregaEscolha');
        fechar('entregaAviso');
        fechar('entregaBloqueio');
        if (!preenchimento) {
            preenchimento = { mesOrig: window.mes, anoOrig: window.ano };
        }
        preenchimento.ano = ano;
        preenchimento.mes = mes;
        preenchimento.dias = dias;
        preenchimento.bloqueado = !!(situacao && situacao.fase === 'bloqueado' &&
                                     situacao.ano_ref === ano && situacao.mes_ref === mes);
        if (window.mes !== mes - 1 || window.ano !== ano) {
            window.mes = mes - 1;
            window.ano = ano;
        }
        if (typeof renderCalendario === 'function') renderCalendario(); // já marca em laranja
        mostrarFaixa();
        var faixa = document.getElementById('entregaFaixa');
        if (faixa && faixa.scrollIntoView) faixa.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function sairPreenchimento() {
        if (!preenchimento) return;
        var orig = preenchimento;
        preenchimento = null;
        var f = document.getElementById('entregaFaixa');
        if (f) f.parentNode.removeChild(f);
        window.mes = orig.mesOrig;
        window.ano = orig.anoOrig;
        if (typeof renderCalendario === 'function') renderCalendario();
    }

    function mostrarFaixa() {
        var p = preenchimento;
        if (!p) return;
        var faixa = document.getElementById('entregaFaixa');
        if (!faixa) {
            faixa = document.createElement('div');
            faixa.id = 'entregaFaixa';
            faixa.className = 'entrega-faixa';
            var secao = document.querySelector('.calendar-section');
            if (secao) secao.insertBefore(faixa, secao.firstChild);
            else document.body.insertBefore(faixa, document.body.firstChild);
        }
        var lista = p.dias.slice(0, 8).map(descreverDia).join(', ') +
                    (p.dias.length > 8 ? ' e mais ' + (p.dias.length - 8) + ' dia(s)' : '');
        var um = p.dias.length === 1;
        if (!p.dias.length) {
            faixa.innerHTML =
                '<h4>Pronto! Os dias do mês de ' + nomeMes(p.ano, p.mes) + ' estão preenchidos.</h4>' +
                '<p>Agora clique em <b>Gerar relatório</b>.</p>' +
                '<div class="entrega-acoes">' +
                    (p.bloqueado ? '' : '<button type="button" class="entrega-secundario" id="entregaFaixaCancelar">Cancelar</button>') +
                    '<button type="button" class="entrega-principal" id="entregaFaixaGerar">Gerar relatório</button>' +
                '</div>';
        } else
        faixa.innerHTML =
            '<h4>Antes de gerar o relatório de ' + nomeMes(p.ano, p.mes) + ', ' + (um ? 'falta preencher 1 dia' : 'faltam ' + p.dias.length + ' dias') + '</h4>' +
            '<p><b>' + (um ? 'Dia pendente: ' : 'Dias pendentes: ') + esc(lista) + '.</b></p>' +
            '<p>Clique no dia destacado em laranja e lance as atividades. Se não houve atividade nesse dia, ' +
            'altere o status para Folga, Férias, Atestado, Ausente ou Liberado.</p>' +
            '<p>Depois, clique em <b>Gerar relatório</b>.</p>' +
            '<div class="entrega-acoes">' +
                (p.bloqueado ? '' : '<button type="button" class="entrega-secundario" id="entregaFaixaCancelar">Cancelar</button>') +
                '<button type="button" class="entrega-principal" id="entregaFaixaGerar">Gerar relatório</button>' +
            '</div>';
        document.getElementById('entregaFaixaGerar').addEventListener('click', function () {
            tentarEntregar(p.ano, p.mes, 'entregaFaixaGerar');
        });
        var canc = document.getElementById('entregaFaixaCancelar');
        if (canc) canc.addEventListener('click', sairPreenchimento);
    }

    // pinta de laranja os dias pendentes sempre que o calendário é redesenhado
    function marcarPendentes() {
        if (!preenchimento) return;
        var grid = document.getElementById('calendarGrid');
        if (!grid) return;
        var celulas = grid.querySelectorAll('.calendar-day:not(.empty)');
        preenchimento.dias.forEach(function (chave) {
            var p = chave.split('-');
            if (+p[0] !== window.ano || +p[1] !== window.mes + 1) return;
            var c = celulas[+p[2] - 1];
            if (c) c.classList.add('entrega-pendente');
        });
    }

    function instalarGanchoCalendario() {
        if (typeof window.renderCalendario !== 'function' || window.renderCalendario._entrega) return;
        var original = window.renderCalendario;
        var novo = function () {
            var r = original.apply(this, arguments);
            if (preenchimento) {
                // atualiza a lista de pendentes com o que acabou de ser salvo
                preenchimento.dias = diasPendentes(preenchimento.ano, preenchimento.mes);
                mostrarFaixa();
                marcarPendentes();
            }
            return r;
        };
        novo._entrega = true;
        window.renderCalendario = novo;
    }

    // ---------------- entrega ----------------
    async function entregar(ano, mes, idBotao) {
        if (enviando) return;
        var c = cliente();
        if (!c) { avisar('Sem conexão com o banco de dados. Tente novamente.'); return; }
        var btn = document.getElementById(idBotao);
        var texto = btn ? btn.textContent : '';
        enviando = true;
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
        try {
            var r = await c.rpc('entregar_relatorio', { p_servidor: nome, p_ano: ano, p_mes: mes });
            if (r.error) throw r.error;
            fechar('entregaEscolha');
            fechar('entregaAviso');
            sairPreenchimento();
            var envios = r.data && r.data.envios ? r.data.envios : 1;
            avisar('Envio concluído: relatório de ' + nomeMes(ano, mes) + (envios > 1 ? ' (atualizado)' : '') + '.');
            await consultarSituacao(); // desbloqueia se era o mês cobrado
        } catch (e) {
            console.error('Entrega do relatório:', e);
            var msg = (e && e.message) ? e.message : '';
            var mp = /DIAS_PENDENTES:([0-9,\-]+)/.exec(msg);
            if (mp) { entrarPreenchimento(ano, mes, mp[1].split(',').filter(Boolean)); return; }
            if (/futuro/i.test(msg)) avisar('Não é possível entregar relatório de mês futuro.');
            else avisar('Não foi possível enviar o relatório. Verifique a conexão e tente novamente.');
        } finally {
            enviando = false;
            if (btn) { btn.disabled = false; btn.textContent = texto; }
        }
    }

    // ---------------- situação (aviso / bloqueio) ----------------
    async function consultarSituacao() {
        var c = cliente();
        if (!c) return null;
        try {
            var r = await c.rpc('situacao_entrega', { p_servidor: nome });
            if (r.error) throw r.error;
            situacao = r.data || { fase: 'nenhum' };
            if (situacao.agora) difRelogio = Date.parse(situacao.agora + 'Z') - Date.now();
        } catch (e) {
            // sem o script SQL ou sem conexão: não cobra nada
            console.warn('situacao_entrega indisponível:', e && e.message ? e.message : e);
            situacao = { fase: 'nenhum' };
        }
        aplicarSituacao();
        return situacao;
    }

    function aplicarSituacao() {
        var s = situacao || { fase: 'nenhum' };
        if (s.fase === 'bloqueado' && preenchimento && preenchimento.ano === s.ano_ref && preenchimento.mes === s.mes_ref) {
            fechar('entregaAviso');
            fechar('entregaBloqueio');
            preenchimento.bloqueado = true;
            mostrarFaixa();
        } else if (s.fase === 'bloqueado') {
            if (preenchimento) sairPreenchimento();
            fechar('entregaAviso');
            fechar('entregaEscolha');
            document.getElementById('entregaBloqueioTexto').textContent =
                'Seu acesso foi bloqueado porque o relatório de ' + nomeMes(s.ano_ref, s.mes_ref) +
                ' não foi gerado dentro do prazo.';
            abrir('entregaBloqueio');
        } else {
            fechar('entregaBloqueio');
        }
        if (s.fase !== 'aviso') fechar('entregaAviso');
    }

    function mostrarAviso() {
        var s = situacao;
        if (!s || s.fase !== 'aviso') return;
        var ref = 'Relatório de ' + nomeMes(s.ano_ref, s.mes_ref);
        if (s.prazo) {
            var p = s.prazo.split('T')[0].split('-');
            ref += ' · bloqueio em ' + p[2] + '/' + p[1] + ' às 17h';
        }
        document.getElementById('entregaAvisoRef').textContent = ref;
        abrir('entregaAviso');
    }

    // verificação a cada 30 s: horários de aviso (11h e 17h) e hora do bloqueio
    async function verificarHorarios() {
        if (!situacao || enviando) return;
        var agora = agoraBrasilia();
        var hoje = dataHoje();

        if (situacao.fase === 'aviso') {
            // chegou a hora do bloqueio?
            if (situacao.prazo && agora >= Date.parse(situacao.prazo + 'Z')) {
                await consultarSituacao();
                return;
            }
            // 11h / 17h com a página aberta desde antes do horário
            for (var i = 0; i < HORARIOS_AVISO.length; i++) {
                var h = HORARIOS_AVISO[i];
                var chave = hoje + '|' + h;
                var instante = Date.parse(hoje + 'T' + pad2(h) + ':00:00Z');
                if (!avisosMostrados[chave] && carregadoEm < instante && agora >= instante) {
                    avisosMostrados[chave] = true;
                    await consultarSituacao();
                    mostrarAviso();
                    return;
                }
            }
        } else if (situacao.fase === 'nenhum' || situacao.fase === 'ok') {
            // virada de dia com a página aberta: consulta de novo uma vez por dia
            if (situacao._dia !== hoje) {
                situacao._dia = hoje;
                if (situacao.agora && situacao.agora.slice(0, 10) !== hoje) {
                    var antes = situacao.fase;
                    await consultarSituacao();
                    if (antes !== 'aviso' && situacao.fase === 'aviso') mostrarAviso();
                }
            }
        }
    }

    // ---------------- início ----------------
    async function iniciar() {
        try { nome = new URLSearchParams(window.location.search).get('user'); } catch (e) { nome = null; }
        if (!nome) return;
        montarInterface();
        instalarGanchoCalendario();
        await consultarSituacao();
        carregadoEm = agoraBrasilia();
        if (situacao) situacao._dia = dataHoje();
        if (situacao && situacao.fase === 'aviso') mostrarAviso(); // aviso ao abrir o sistema
        timer = setInterval(verificarHorarios, 30000);
    }

    // expostas para testes
    window._entregaRelatorio = { diasPendentes: diasPendentes, consultarSituacao: consultarSituacao, verificarHorarios: verificarHorarios, estado: function () { return { situacao: situacao, carregadoEm: carregadoEm, difRelogio: difRelogio }; } };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
