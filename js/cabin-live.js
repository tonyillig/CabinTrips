/* Cabin Trip live data loader.
 * Reads data/trip-YYYY.json on page load (cache-busted) and fills in:
 *   chips, confirmed count, live/recap banner, Trip Board, and (Planning page only) the budget card.
 * If the file can't load, the page keeps the numbers already written in its HTML (the fallback).
 * The page says which one it is with <body data-ct-page="planning|crew" data-ct-year="2026">.
 */
(function () {
  var body = document.body;
  var PAGE = body.getAttribute('data-ct-page') || 'crew';
  var YEAR = body.getAttribute('data-ct-year') || '2026';
  var URL = 'data/trip-' + YEAR + '.json?t=' + Date.now();

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dollars(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function cents(n) {
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function shortDate(iso) {
    var p = String(iso).split('-');
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+p[1] - 1];
    return m + ' ' + (+p[2]);
  }

  var ICON = { done: '✅', todo: '⏳', info: 'ℹ️' };
  var PILL = {
    paid: ['pill-done', 'paid ✅'], done: ['pill-done', 'done ✅'], closed: ['pill-done', 'done ✅'],
    open: ['pill-todo', 'in progress'], pending: ['pill-todo', 'pending'], 'trip-end': ['pill-todo', 'trip end'], owed: ['pill-todo', 'owed']
  };

  function renderChips(d) {
    var el = $('ct-chips');
    if (!el || !d.chips) return;
    el.innerHTML = d.chips
      .filter(function (c) { return !(PAGE === 'crew' && c.crewHide); })
      .map(function (c) {
        var st = c.state in ICON ? c.state : 'info';
        return '<div class="status-chip chip-' + st + '">' + esc(c.icon || ICON[st]) + ' ' + esc(c.text) + '</div>';
      }).join('');
  }

  function renderCounts(d) {
    var el = $('ct-confirmed');
    if (el && d.confirmedCount != null) el.textContent = d.confirmedCount;
  }

  function renderBanner(d) {
    var w = d.wrapUp || {};
    if (d.status === 'complete') {
      var t = '🏁 TRIP COMPLETE' + (w.winner ? ' · 🏆 ' + esc(w.winner) + ' WINS' : '');
      if (PAGE === 'planning' && w.carryTo2027 != null) t += ' · ' + dollars(w.carryTo2027) + ' carries to ' + (+YEAR + 1);
      window.CT_BANNER = t;
    } else if (d.status === 'live') {
      window.CT_BANNER = '🎉 WE\'RE AT THE CABIN';
    }
    var lbl = document.querySelector('.countdown-label');
    if (lbl && d.status === 'complete') lbl.textContent = "That's a Wrap";
    else if (lbl && d.status === 'live') lbl.textContent = 'Right Now';
    var sub = $('ct-updated');
    if (sub && d.updatedAtLabel) sub.textContent = 'Updated ' + d.updatedAtLabel + ' · rev ' + d.rev;
    if (typeof window.updateCountdown === 'function') window.updateCountdown();
  }

  function renderBoard(d) {
    var el = $('ct-board');
    var b = d.tripBoard;
    if (!el || !b) return;
    var html = '';
    if (b.movieNight && b.movieNight.title) {
      html += '<div class="board-movie">🎬 <b>Movie night:</b> ' + esc(b.movieNight.title) +
        (b.movieNight.when ? ' <span class="board-when">· ' + esc(b.movieNight.when) + '</span>' : '') + '</div>';
    } else {
      html += '<div class="board-movie">🎬 <b>Movie night:</b> <span class="board-when">TBD</span></div>';
    }
    var list = (b.announcements || []).slice(0, 5);
    if (list.length) {
      html += '<ul class="board-list">' + list.map(function (a) {
        return '<li><span class="board-ts">' + esc(a.ts) + '</span>' + esc(a.text) + '</li>';
      }).join('') + '</ul>';
    } else {
      html += '<div class="board-empty">No announcements yet.</div>';
    }
    el.innerHTML = html;
  }

  function renderBudget(d) {
    if (PAGE !== 'planning' || !d.budget || !$('ct-budget-rows')) return;
    var b = d.budget, t = b.totals;
    $('ct-b-budget').textContent = dollars(t.budget);
    $('ct-b-spent').textContent = dollars(t.spent);
    $('ct-b-remaining').textContent = dollars(t.remaining);
    var pct = t.budget > 0 ? Math.min(100, Math.round(t.spent / t.budget * 100)) : 0;
    $('ct-b-barlabel').textContent = dollars(t.spent) + ' spent (' + pct + '%)';
    $('ct-b-barmax').textContent = dollars(t.budget);
    $('ct-b-bar').style.width = pct + '%';

    var rows = '';
    rows += '<tr><td>Paid In (' + b.paidIn.count + ' × $' + b.paidIn.perPerson + ')</td><td>' + cents(t.paidIn) +
      '</td><td></td><td><span class="pill pill-done">collected</span></td></tr>';
    rows += '<tr><td>' + (+YEAR - 1) + ' Carryover</td><td>' + cents(b.carryover) +
      '</td><td></td><td><span class="pill pill-done">carryover</span></td></tr>';
    b.lines.forEach(function (ln) {
      var p = PILL[ln.status] || ['pill-tbd', esc(ln.status)];
      var over = ln.actual != null && ln.actual > ln.planned + 0.005;
      rows += '<tr><td>' + esc(ln.label) + '</td><td>' + cents(ln.planned) + '</td><td' +
        (over ? ' class="over"' : '') + '>' + (ln.actual != null ? cents(ln.actual) : '—') +
        '</td><td><span class="pill ' + p[0] + '">' + p[1] + '</span></td></tr>';
    });
    rows += '<tr class="row-total"><td>Projected Surplus</td><td colspan="2">' + dollars(t.projectedSurplus) +
      '</td><td><span class="pill pill-tbd">est.</span></td></tr>';
    $('ct-budget-rows').innerHTML = rows;

    var ex = $('ct-expenses');
    if (ex) {
      var lineLabel = {};
      b.lines.forEach(function (ln) { lineLabel[ln.id] = ln.label; });
      ex.innerHTML = b.expenses.slice().reverse().map(function (e) {
        return '<tr><td>' + shortDate(e.date) + '</td><td>' + esc(e.label) +
          '<div class="exp-line">' + esc(lineLabel[e.line] || e.line) + '</div></td><td>' + cents(e.amount) + '</td></tr>';
      }).join('');
    }

    var note = $('ct-b-note');
    if (note) {
      var r = b.reimbursements || {}, dr = r.drivers, er = r.expenses;
      var s = b.paidIn.count + ' payers × $' + b.paidIn.perPerson + ' = ' + cents(t.paidIn) + ' + ' + cents(b.carryover) +
        ' carryover = <b>' + cents(t.budget) + ' total budget</b>.';
      if (er) s += '<br>Expense paybacks: ' + er.paidCount + ' of ' + er.count + ' paid (' + cents(er.total) + ').';
      if (dr) s += '<br>Driver paybacks: ' + dr.count + ' drivers (' +
        (dr.breakdown || (dr.gasCount + ' × $' + dr.rate + ' + ' + dr.electricCount + ' × $' + dr.electricRate + ' EV')) +
        ') = ' + cents(dr.total) + ' · ' + dr.paidCount + ' of ' + dr.count + ' paid.';
      note.innerHTML = s;
    }
  }

  function apply(d) {
    var steps = [renderChips, renderCounts, renderBanner, renderBoard, renderBudget];
    steps.forEach(function (fn) {
      try { fn(d); } catch (e) { if (window.console) console.warn('cabin-live:', fn.name, e); }
    });
    body.setAttribute('data-ct-rev', d.rev);
  }

  /* ---------- Named ledger (planning page only): data/ledger-YYYY.json ---------- */
  function when(method, date) {
    var parts = [];
    if (method) parts.push(esc(method));
    if (date) parts.push(shortDate(date));
    return parts.join(' · ') || '—';
  }
  function renderLedger(L) {
    var el;
    if ((el = $('ct-money-in'))) {
      var tin = 0;
      el.innerHTML = L.moneyIn.map(function (p) {
        tin += p.amount;
        var ok = p.amount > 0;
        return '<tr><td>' + esc(p.name) + '</td><td>' + (ok ? cents(p.amount) : '$0') + '</td><td>' +
          (ok ? when(p.method, p.date) : '—') + '</td><td><span class="pill ' + (ok ? 'pill-done' : 'pill-tbd') + '">' +
          esc(p.status) + '</span></td></tr>';
      }).join('') + '<tr class="row-total"><td>Total collected</td><td>' + cents(tin) + '</td><td colspan="2"></td></tr>';
    }
    if ((el = $('ct-money-out'))) {
      var tout = 0;
      el.innerHTML = L.moneyOut.slice().reverse().map(function (m) {
        tout += m.amount;
        var pb = !m.payback ? '<span class="pill pill-tbd">n/a</span>'
          : m.payback.status === 'paid' ? '<span class="pill pill-done">✅ ' + when(m.payback.method, m.payback.date) + '</span>'
          : '<span class="pill pill-todo">⏳ owed</span>';
        return '<tr><td>' + shortDate(m.date) + '</td><td>' + esc(m.label) + '<div class="exp-line">' + esc(m.line) +
          '</div></td><td>' + cents(m.amount) + '</td><td>' + esc(m.frontedBy) + '</td><td>' + pb + '</td></tr>';
      }).join('') + '<tr class="row-total"><td></td><td>Total spent</td><td>' + cents(tout) + '</td><td colspan="2"></td></tr>';
    }
    if ((el = $('ct-driver-rows'))) {
      var td = 0;
      el.innerHTML = L.drivers.map(function (d) {
        td += d.amount;
        var st = d.status === 'paid' ? '<span class="pill pill-done">✅ ' + when(d.method, d.date) + '</span>'
          : '<span class="pill pill-todo">⏳ ' + esc(d.status) + '</span>';
        return '<tr><td>' + esc(d.name) + '</td><td>' + esc(d.vehicle === 'electric' ? 'EV' : d.vehicle) + '</td><td>' +
          cents(d.amount) + '</td><td>' + st + '</td></tr>';
      }).join('') + '<tr class="row-total"><td>Total</td><td></td><td>' + cents(td) + '</td><td></td></tr>';
    }
    if ((el = $('ct-recon'))) {
      var r = L.reconciliation;
      var row = function (lbl, v, cls) {
        return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + lbl + '</td><td>' + v + '</td></tr>';
      };
      el.innerHTML =
        row('Collected from members', cents(r.collected)) +
        row('+ Carryover from ' + (+YEAR - 1), cents(r.carryoverIn)) +
        row('= Total budget', cents(r.budget), 'row-total') +
        row('− Paid direct from trip fund (lodging)', cents(r.paidDirect)) +
        row('− Paybacks sent', cents(r.paybacksPaid)) +
        row('− Driver payouts sent', cents(r.driversPaid)) +
        row('= Cash on hand now', cents(r.cashOnHand), 'row-total') +
        row('− Paybacks still owed', cents(r.paybacksOwed)) +
        row('− Driver payouts still owed', cents(r.driversOwed)) +
        row('= Carryover to ' + (+YEAR + 1), cents(r.carryoverOut), 'row-total');
    }
  }
  if (PAGE === 'planning' && $('ct-money-in')) {
    fetch('data/ledger-' + YEAR + '.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (L) { try { renderLedger(L); } catch (e) { if (window.console) console.warn('ledger:', e); } })
      .catch(function (e) { if (window.console) console.warn('ledger: using built-in numbers', e); });
  }

  fetch(URL, { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(apply)
    .catch(function (e) {
      if (window.console) console.warn('cabin-live: using built-in numbers', e);
      var sub = $('ct-updated');
      if (sub) sub.textContent = 'Showing saved numbers (live data unavailable)';
    });
})();
