/**
 * Eventos - agenda presencial, lida de data/eventos.json (editado à mão; formato em automation/validators.js).
 * Próximos primeiro, em ordem de data; os que já passaram ficam guardados num bloco fechado.
 * Cada evento tem "Adicionar à agenda" (arquivo .ics gerado aqui no navegador, nada sai daqui).
 */
(function () {
  'use strict';

  const FEED = 'data/eventos.json';
  const MAX_PASSADOS = 10;
  const DURACAO_PADRAO_H = 2;     // sem horaFim, a agenda marca 2 h
  const WEEKDAY = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
  const MONTH = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

  const root = document.getElementById('eventos-feed');
  if (!root) return;

  // ---------- util ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  const safeUrl = url => (typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null);
  function extLink(url, text, cls) {
    const a = el('a', cls, text);
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const parts = iso => iso.split('-').map(Number);
  const dayOf = iso => { const [y, m, d] = parts(iso); return new Date(Date.UTC(y, m - 1, d, 12)); };
  const ddmm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  const daysBetween = (a, b) => Math.round((dayOf(b) - dayOf(a)) / 864e5);

  // ---------- agenda (.ics) ----------
  const icsText = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, m => '\\' + m);
  const icsDate = iso => iso.replace(/-/g, '');
  /** Horário de Brasília (UTC-3, sem horário de verão) em UTC. */
  function icsUtc(iso, hhmm, plusHours = 0) {
    const [y, m, d] = parts(iso);
    const [h, min] = hhmm.split(':').map(Number);
    return new Date(Date.UTC(y, m - 1, d, h + 3 + plusHours, min)).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  }
  function ics(e) {
    const onde = [e.local, e.cidade, e.uf].filter(Boolean).join(', ');
    let when;
    if (e.hora) {
      const fimDia = e.fim || e.data;
      const end = e.horaFim ? icsUtc(fimDia, e.horaFim) : icsUtc(e.data, e.hora, DURACAO_PADRAO_H);
      when = [`DTSTART:${icsUtc(e.data, e.hora)}`, `DTEND:${end}`];
    } else {
      const fim = new Date(dayOf(e.fim || e.data).getTime() + 864e5).toISOString().slice(0, 10);
      when = [`DTSTART;VALUE=DATE:${icsDate(e.data)}`, `DTEND;VALUE=DATE:${icsDate(fim)}`];
    }
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//DEDSEC//Eventos//PT', 'BEGIN:VEVENT',
      `UID:${e.id}@0ff-gr1d`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
      ...when,
      `SUMMARY:${icsText(e.titulo)}`,
      onde ? `LOCATION:${icsText(onde)}` : null,
      `DESCRIPTION:${icsText([e.papel, e.descricao, safeUrl(e.link)].filter(Boolean).join('\n\n'))}`,
      safeUrl(e.link) ? `URL:${e.link}` : null,
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean).join('\r\n');
  }
  function downloadIcs(e) {
    const url = URL.createObjectURL(new Blob([ics(e)], { type: 'text/calendar;charset=utf-8' }));
    const a = el('a');
    a.href = url;
    a.download = `${e.id}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- cartão ----------
  function countdown(e, today) {
    const ate = daysBetween(today, e.data);
    if (ate <= 0 && (e.fim || e.data) >= today) return 'ROLANDO HOJE';
    if (ate === 1) return 'AMANHÃ';
    if (ate > 1) return `EM ${ate} DIAS`;
    return null;
  }

  function card(e, today, passado) {
    const c = el('article', 'content-section evento-card' + (passado ? ' evento-passado' : ''));

    const date = el('div', 'evento-data');
    date.setAttribute('aria-hidden', 'true');
    date.append(el('span', 'evento-dia-semana', WEEKDAY[dayOf(e.data).getUTCDay()]),
      el('span', 'evento-dia', e.data.slice(8, 10)),
      el('span', 'evento-mes', MONTH[parts(e.data)[1] - 1]));
    c.appendChild(date);

    const body = el('div', 'evento-corpo');
    const meta = el('div', 'feed-meta');
    const cd = !passado && countdown(e, today);
    if (cd) meta.appendChild(el('span', 'feed-badge' + (cd === 'ROLANDO HOJE' || cd === 'AMANHÃ' ? ' evento-badge-quente' : ''), cd));
    if (e.papel) meta.appendChild(el('span', 'feed-badge evento-badge-papel', e.papel.toUpperCase()));
    if (meta.childNodes.length) body.appendChild(meta);

    body.appendChild(el('h2', 'feed-title', e.titulo));

    const quando = `${ddmm(e.data)}${e.fim && e.fim !== e.data ? ` a ${ddmm(e.fim)}` : ''}${e.hora ? ` · ${e.hora}${e.horaFim ? `–${e.horaFim}` : ''}` : ''}`;
    body.appendChild(el('p', 'evento-info', `🗓 ${quando}`));
    const onde = [e.local, [e.cidade, e.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ');
    if (onde) body.appendChild(el('p', 'evento-info', `📍 ${onde}`));
    if (e.descricao && !passado) body.appendChild(el('p', 'feed-text evento-desc', e.descricao));

    if (!passado) {
      const actions = el('div', 'evento-acoes');
      const link = safeUrl(e.link);
      if (link) actions.appendChild(extLink(link, 'MAIS INFO / INSCRIÇÃO', 'evento-botao'));
      const cal = el('button', 'evento-botao', 'ADICIONAR À AGENDA');
      cal.type = 'button';
      cal.addEventListener('click', () => downloadIcs(e));
      actions.appendChild(cal);
      const mapQuery = [e.local, e.cidade, e.uf].filter(Boolean).join(', ');
      if (mapQuery) actions.appendChild(extLink(`https://www.openstreetmap.org/search?query=${encodeURIComponent(mapQuery)}`, 'VER NO MAPA', 'evento-botao'));
      body.appendChild(actions);
    }
    c.appendChild(body);
    return c;
  }

  function message(title, text) {
    const s = el('div', 'content-section');
    s.append(el('h2', 'feed-title', title), el('p', 'feed-text', text));
    return s;
  }

  // ---------- página ----------
  function render(data) {
    root.textContent = '';
    const list = (data && Array.isArray(data.eventos) ? data.eventos : [])
      .filter(e => e && typeof e.titulo === 'string' && isDate(e.data) && (!e.fim || isDate(e.fim)));
    const today = todayLocal();
    const key = e => e.data + (e.hora || '');
    const proximos = list.filter(e => (e.fim || e.data) >= today).sort((a, b) => key(a).localeCompare(key(b)));
    const passados = list.filter(e => (e.fim || e.data) < today).sort((a, b) => key(b).localeCompare(key(a))).slice(0, MAX_PASSADOS);

    if (proximos.length) proximos.forEach(e => root.appendChild(card(e, today, false)));
    else root.appendChild(message('NENHUM EVENTO MARCADO', 'Agenda limpa por enquanto. Ligue os avisos da 2B no Telegram para saber assim que entrar um evento novo.'));

    if (passados.length) {
      const det = el('details', 'evento-historico');
      det.appendChild(el('summary', null, `JÁ ROLOU (${passados.length})`));
      passados.forEach(e => det.appendChild(card(e, today, true)));
      root.appendChild(det);
    }
  }

  fetch(`${FEED}?t=${Date.now()}`, { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(render)
    .catch(() => {
      root.textContent = '';
      root.appendChild(message('SINAL PERDIDO', 'Não deu para carregar a agenda agora. Tente de novo em instantes.'));
    });
})();
