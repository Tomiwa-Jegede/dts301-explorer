/* Cyberattack Propagation Explorer — static UI over GraphX output.
   Data: ui/data/index.json + ui/data/<slug>.json (written by GraphJsonExport). */

const state = {
  index: null,
  data: null,
  cy: null,
  metric: 'pr',
  windowIndex: 0,       // 0 = all windows, 1..N = windows[n-1]
  threshold: 0,         // 0 = no byte filter
  showLabels: false,
  playing: false,
  timer: null,
  colours: new Map(),
  max: { pr: 0, bc: 0, deg: 0, bytes: 0 },
  edgeScale: { min: 1, max: 1, logMin: 0, logSpan: 1 },
  focusedIp: null,
  noteTimer: null,
  ready: false
};

const $ = (id) => document.getElementById(id);

/* The two devices the report tracks by name. Every other node is ordinary. */
const GATEWAY_IP = '192.168.137.1';
const SCANNER_IP = '192.168.137.178';

boot();

async function boot() {
  try {
    state.index = await fetchJson('data/index.json');
  } catch (err) {
    $('fatal-msg').textContent = String(err.message || err);
    $('fatal').hidden = false;
    return;
  }

  $('app').hidden = false;
  $('meta').textContent =
    `${state.index.labels.length} labels · generated ${formatTime(state.index.generatedAt)}`;
  $('source-line').textContent = `Source: ${state.index.source}`;

  renderLabels();
  bindControls();

  // A shared link can name a capture, a time window, a host and the view
  // settings. Everything is optional; a bare URL still opens the first capture.
  const params = new URLSearchParams(location.search);
  const wantedMetric = params.get('metric');
  if (wantedMetric && ['pr', 'bc', 'deg'].includes(wantedMetric)) {
    $('metric').value = wantedMetric;
  }

  const slugs = state.index.labels.map((l) => l.slug);
  const slug = slugs.includes(params.get('label'))
    ? params.get('label')
    : state.index.labels[0].slug;
  await selectLabel(slug);

  if (params.has('threshold')) {
    const threshold = Number(params.get('threshold'));
    if (Number.isFinite(threshold)) {
      state.threshold = Math.max(0, Math.min(100, threshold));
      $('threshold').value = String(state.threshold);
      updateThresholdLabel();
      applyFilters();
    }
  }

  if (params.has('window')) {
    const win = Number(params.get('window'));
    if (Number.isInteger(win) && win >= 0 && win <= state.data.windows.length) {
      setWindowIndex(win);
    }
  }

  const ip = params.get('ip');
  if (ip && !focusNode(ip)) {
    showFocusNote(`${ip} is not in ${state.data.label}.`);
  }

  state.ready = true;
  syncUrl();
}

/** Keep the address bar in step with what is on screen, so copying it works. */
function syncUrl() {
  if (!state.ready || !state.data) return;
  const p = new URLSearchParams();
  p.set('label', state.data.slug);
  if (state.focusedIp) p.set('ip', state.focusedIp);
  if (state.windowIndex > 0) p.set('window', String(state.windowIndex));
  if (state.threshold > 0) p.set('threshold', String(state.threshold));
  if (state.metric !== 'pr') p.set('metric', state.metric);
  history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
}

async function copyLink() {
  syncUrl();
  const url = location.href;
  try {
    await navigator.clipboard.writeText(url);
    flashShare('Copied');
  } catch (err) {
    // Fallback for browsers without the async clipboard API.
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    flashShare(ok ? 'Copied' : 'Copy failed');
    if (!ok) showFocusNote(url);
  }
}

function flashShare(text) {
  const btn = $('share');
  if (!btn) return;
  btn.textContent = text;
  btn.classList.add('on');
  setTimeout(() => {
    btn.textContent = 'Copy link';
    btn.classList.remove('on');
  }, 1600);
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

/* ---------- sidebar ---------- */

function renderLabels() {
  const list = $('label-list');
  list.innerHTML = '';
  state.index.labels
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .forEach((l) => {
      const btn = document.createElement('button');
      btn.className = 'label-btn';
      btn.dataset.slug = l.slug;
      btn.innerHTML = `<span class="name">${escapeHtml(l.label)}</span>
        <span class="stat">${formatInt(l.totalVertices)} nodes · ${formatInt(l.totalEdges)} edges${
          l.truncated ? ' · capped' : ''
        }</span>`;
      btn.addEventListener('click', () => selectLabel(l.slug));
      list.appendChild(btn);
    });
}

/* ---------- load a label ---------- */

async function selectLabel(slug) {
  stopPlay();
  const previousFocus = state.focusedIp;
  hideFocusNote();
  document.querySelectorAll('.label-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.slug === slug)
  );

  const loading = $('details-content');
  loading.innerHTML = '<p class="hint">Loading…</p>';

  let data;
  try {
    data = await fetchJson(`data/${slug}.json`);
  } catch (err) {
    loading.innerHTML = `<p class="hint">Could not load ${escapeHtml(slug)}: ${escapeHtml(err.message)}</p>`;
    return;
  }

  state.data = data;
  state.metric = $('metric').value;
  state.windowIndex = 0;
  state.threshold = 0;
  $('threshold').value = 0;
  $('search').value = '';

  computeColours(data);
  computeMaxima(data);
  buildGraph(data);
  resetWindowSlider(data);
  updateThresholdLabel();
  renderSummary();
  renderLegend();
  renderEdgeLegend();
  applyFilters();
  populateIps(data);

  if (previousFocus) {
    if (data.vertices.some((v) => v.ip === previousFocus)) {
      focusNode(previousFocus);
    } else {
      clearFocus({
        note: `${previousFocus} is not in ${data.label}; focus cleared.`
      });
    }
  }
  syncUrl();
}

/* One neutral colour for the main island; separate colours only when extra
   components actually exist, so a one-component capture stays calm. */
const MAIN_COLOUR = '#4f7fa8';
const EXTRA_COLOURS = ['#e08a3c', '#8e6bd8', '#3fa66a', '#d9c04a', '#c95a8a', '#6bb8c9'];

/* Sequential, colour-blind-safe ramp (viridis) for edge traffic volume.
   It starts at blue rather than near-black so light edges stay readable. */
const EDGE_RAMP = [
  '#3e4989', '#31688e', '#26828e', '#1f9e89',
  '#35b779', '#6ece58', '#b5de2b', '#fde725'
];

function computeColours(data) {
  const counts = new Map();
  data.vertices.forEach((v) => counts.set(v.comp, (counts.get(v.comp) || 0) + 1));
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);

  state.colours.clear();
  ordered.forEach((comp, i) => {
    const colour = i === 0
      ? MAIN_COLOUR
      : EXTRA_COLOURS[(i - 1) % EXTRA_COLOURS.length];
    state.colours.set(comp, colour);
  });
}

function computeMaxima(data) {
  state.max = { pr: 0, bc: 0, deg: 0, bytes: 0 };
  data.vertices.forEach((v) => {
    state.max.pr = Math.max(state.max.pr, v.pr);
    state.max.bc = Math.max(state.max.bc, v.bc);
    state.max.deg = Math.max(state.max.deg, v.deg);
  });

  // The edge scale is fixed for the whole label (all capture edges, so all
  // time windows): scrubbing time or moving the byte filter never rescales it.
  let minBytes = Infinity;
  data.edges.forEach((e) => {
    const b = Math.max(1, Number(e.b) || 0);
    minBytes = Math.min(minBytes, b);
    state.max.bytes = Math.max(state.max.bytes, b);
  });
  state.max.bytes = Math.max(state.max.bytes, 1);
  if (!Number.isFinite(minBytes)) minBytes = 1;

  const logMin = Math.log1p(minBytes);
  const logMax = Math.log1p(state.max.bytes);
  state.edgeScale = {
    min: minBytes,
    max: state.max.bytes,
    logMin,
    logSpan: logMax > logMin ? logMax - logMin : 1
  };
}

function nodeSize(v) {
  const value = state.metric === 'bc' ? v.bc : state.metric === 'deg' ? v.deg : v.pr;
  const max = state.max[state.metric] || 1;
  const t = max > 0 ? Math.sqrt(Math.max(value, 0) / max) : 0;
  return Math.round(12 + 32 * t);
}

function edgeScaleT(bytes) {
  const s = state.edgeScale;
  const t = (Math.log1p(Math.max(0, Number(bytes) || 0)) - s.logMin) / s.logSpan;
  return Math.max(0, Math.min(1, t));
}

function edgeWidth(bytes) {
  return (0.8 + 5.2 * edgeScaleT(bytes)).toFixed(2);
}

function edgeColour(bytes) {
  const pos = edgeScaleT(bytes) * (EDGE_RAMP.length - 1);
  const i = Math.floor(pos);
  const j = Math.min(i + 1, EDGE_RAMP.length - 1);
  return mixHex(EDGE_RAMP[i], EDGE_RAMP[j], pos - i);
}

function mixHex(a, b, t) {
  const ca = hexRgb(a);
  const cb = hexRgb(b);
  const mixed = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function hexRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function buildGraph(data) {
  const elements = [];
  data.vertices.forEach((v) => {
    const role = v.ip === GATEWAY_IP ? 'gateway' : v.ip === SCANNER_IP ? 'scanner' : '';
    elements.push({
      classes: role,
      data: {
        id: v.id,
        ip: v.ip,
        pr: v.pr,
        bc: v.bc,
        deg: v.deg,
        comp: v.comp,
        colour: state.colours.get(v.comp) || '#7f8ea3',
        sz: nodeSize(v)
      }
    });
  });
  data.edges.forEach((e, i) => {
    elements.push({
      data: {
        id: `e${i}`,
        source: e.s,
        target: e.t,
        p: e.p,
        b: e.b,
        w: edgeWidth(e.b),
        c: edgeColour(e.b)
      }
    });
  });

  if (!state.cy) {
    state.cy = cytoscape({
      container: $('cy'),
      wheelSensitivity: 0.5,
      minZoom: 0.02,
      maxZoom: 6,
      autoungrabify: true,
      boxSelectionEnabled: false,
      panningEnabled: true,
      userPanningEnabled: true,
      selectionType: 'single',
      style: stylesheet(),
      elements
    });
    wireGraphEvents();
  } else {
    state.cy.elements().remove();
    state.cy.add(elements);
  }

  state.showLabels = data.vertices.length <= 60;
  $('labels-toggle').classList.toggle('on', state.showLabels);
  applyLabelVisibility();

  const cy = state.cy;
  cy.layout(layoutOptions(data.vertices.length)).run();
  cy.fit(undefined, 40);
  cy.resize();

  updateCounts();
}

function stylesheet() {
  return [
    {
      selector: 'node',
      style: {
        'background-color': 'data(colour)',
        width: 'data(sz)',
        height: 'data(sz)',
        'border-width': 1,
        'border-color': '#0b0f14',
        'border-opacity': 0.6,
        label: '',
        'font-size': 8,
        color: '#c9d5e3',
        'text-outline-width': 2,
        'text-outline-color': '#0e1116',
        'min-zoomed-font-size': 8
      }
    },
    {
      selector: 'edge',
      style: {
        width: 'data(w)',
        'line-color': 'data(c)',
        'target-arrow-color': 'data(c)',
        'target-arrow-shape': 'triangle',
        'arrow-scale': 0.7,
        'curve-style': 'bezier',
        opacity: 0.8
      }
    },
    { selector: '.dim', style: { opacity: 0.08 } },
    { selector: 'edge.dim', style: { opacity: 0.04 } },
    { selector: 'node.labelled', style: { label: 'data(ip)' } },
    {
      selector: 'node.sel',
      style: {
        'border-width': 3,
        'border-color': '#4cc2ff',
        'border-opacity': 1,
        'overlay-color': '#4cc2ff',
        'overlay-opacity': 0.28,
        'overlay-padding': 5
      }
    },
    {
      selector: 'node.hit',
      style: {
        'border-width': 3,
        'border-color': '#7fe3ff',
        'border-opacity': 1,
        'overlay-color': '#4cc2ff',
        'overlay-opacity': 0.28,
        'overlay-padding': 5
      }
    },
    {
      selector: 'node.focus',
      style: {
        'border-width': 3,
        'border-color': '#ffffff',
        'border-opacity': 1,
        'overlay-color': '#4cc2ff',
        'overlay-opacity': 0.3,
        'overlay-padding': 5
      }
    },
    {
      selector: 'edge.focus-out',
      style: { 'line-style': 'solid', opacity: 1 }
    },
    {
      selector: 'edge.focus-in',
      style: {
        'line-style': 'dashed',
        'line-dash-pattern': [6, 4],
        opacity: 1
      }
    },
    {
      selector: 'node.gateway',
      style: { 'border-width': 3.5, 'border-color': '#f0b429', 'border-opacity': 1 }
    },
    {
      selector: 'node.scanner',
      style: {
        'background-color': '#c0392b',
        'border-width': 3.5,
        'border-color': '#ff9a8a',
        'border-opacity': 1
      }
    }
  ];
}

function layoutOptions(n) {
  if (n > 700) {
    return {
      name: 'concentric',
      animate: false,
      concentric: (node) => node.data('pr') * 1000,
      levelWidth: () => 3,
      minNodeSpacing: 6,
      fit: true,
      padding: 30
    };
  }
  if (n > 300) {
    return {
      name: 'cose',
      animate: false,
      numIter: 600,
      nodeRepulsion: 12000,
      idealEdgeLength: 60,
      fit: true,
      padding: 30
    };
  }
  return {
    name: 'cose',
    animate: false,
    numIter: 1000,
    nodeRepulsion: 9000,
    idealEdgeLength: 90,
    gravity: 0.3,
    fit: true,
    padding: 40
  };
}

/* ---------- focus ---------- */

/** The one focus path shared by node clicks and the Find IP box. */
function focusNode(ip, options = {}) {
  const node = findNodeByIp(ip);
  if (!node) return false;

  const syncSearch = options.syncSearch !== false;
  const center = options.center !== false;

  state.focusedIp = node.data('ip');
  hideFocusNote();
  if (syncSearch) $('search').value = node.data('ip');

  applyFocusVisuals(node, center);
  renderNode(node);
  syncUrl();
  return true;
}

function findNodeByIp(ip) {
  if (!state.cy) return null;
  return state.cy.nodes().filter((n) => String(n.data('ip')) === String(ip))[0] || null;
}

function applyFocusVisuals(node, center) {
  const cy = state.cy;
  const neighbours = node.neighborhood('node');
  const outEdges = node.outgoers('edge');
  const inEdges = node.incomers('edge');

  cy.batch(() => {
    cy.elements().removeClass('dim focus focus-out focus-in sel hit');
    cy.elements().addClass('dim');
    node.removeClass('dim').addClass('focus');
    neighbours.removeClass('dim');
    node.connectedEdges().removeClass('dim');
    outEdges.addClass('focus-out');
    inEdges.addClass('focus-in');
  });
  applyLabelVisibility();

  if (center) {
    cy.animate({ center: { eles: node }, zoom: Math.max(cy.zoom(), 1.2), duration: 250 });
  }
}

function clearFocus(options = {}) {
  const { clearSearch = true, resetPanel = true, note = '' } = options;
  state.focusedIp = null;

  if (state.cy) {
    state.cy.batch(() => {
      state.cy.elements().removeClass('dim focus focus-out focus-in sel hit');
    });
    applyLabelVisibility();
  }
  if (clearSearch) $('search').value = '';
  if (resetPanel) renderSummary();
  if (note) showFocusNote(note);
  syncUrl();
}

function hideFocusNote() {
  if (state.noteTimer) {
    clearTimeout(state.noteTimer);
    state.noteTimer = null;
  }
  const note = $('focus-note');
  if (note) note.hidden = true;
}

function showFocusNote(message) {
  const note = $('focus-note');
  if (!note) return;
  note.textContent = message;
  note.hidden = false;
  if (state.noteTimer) clearTimeout(state.noteTimer);
  state.noteTimer = setTimeout(() => {
    note.hidden = true;
    state.noteTimer = null;
  }, 5000);
}

/* ---------- interaction ---------- */

function wireGraphEvents() {
  const cy = state.cy;
  const tooltip = $('tooltip');

  cy.on('mouseover', 'node', (evt) => {
    const node = evt.target;
    tooltip.innerHTML = tooltipHtml(node);
    tooltip.hidden = false;
    if (state.focusedIp) return;
    cy.nodes().addClass('dim');
    node.removeClass('dim').addClass('sel');
    node.closedNeighborhood().removeClass('dim');
    applyLabelVisibility();
  });

  cy.on('mousemove', 'node', (evt) => {
    const p = evt.renderedPosition || { x: 0, y: 0 };
    tooltip.style.left = `${p.x + 14}px`;
    tooltip.style.top = `${p.y + 14}px`;
  });

  cy.on('mouseout', 'node', () => {
    tooltip.hidden = true;
    if (state.focusedIp) return;
    cy.elements().removeClass('dim');
    cy.nodes().removeClass('sel');
    applyLabelVisibility();
  });

  cy.on('mouseover', 'edge', (evt) => {
    const edge = evt.target;
    tooltip.innerHTML = edgeTooltipHtml(edge);
    tooltip.hidden = false;
    if (state.focusedIp) return;
    cy.elements().addClass('dim');
    edge.removeClass('dim');
    edge.connectedNodes().removeClass('dim');
    applyLabelVisibility();
  });

  cy.on('mousemove', 'edge', (evt) => {
    const p = evt.renderedPosition || { x: 0, y: 0 };
    tooltip.style.left = `${p.x + 14}px`;
    tooltip.style.top = `${p.y + 14}px`;
  });

  cy.on('mouseout', 'edge', () => {
    tooltip.hidden = true;
    if (state.focusedIp) return;
    cy.elements().removeClass('dim');
    applyLabelVisibility();
  });

  cy.on('tap', 'node', (evt) => {
    focusNode(evt.target.data('ip'));
  });

  cy.on('tap', (evt) => {
    if (evt.target === cy) clearFocus();
  });

  /* Panning when the drag starts on a dot. Cytoscape only pans background
     drags, and a dense graph covers most of the canvas with dots. */
  let fromNode = null;
  cy.on('mousedown', 'node', (evt) => {
    const oe = evt.originalEvent;
    fromNode = { x: oe.clientX, y: oe.clientY };
  });
  window.addEventListener('mousemove', (evt) => {
    if (!fromNode) return;
    const dx = evt.clientX - fromNode.x;
    const dy = evt.clientY - fromNode.y;
    if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
    const p = cy.pan();
    cy.pan({ x: p.x + dx, y: p.y + dy });
    fromNode = { x: evt.clientX, y: evt.clientY };
  });
  window.addEventListener('mouseup', () => {
    fromNode = null;
  });
}

function tooltipHtml(node) {
  const d = node.data();
  return `<b>${escapeHtml(d.ip)}</b>
    <div class="row">PageRank <span>${formatNum(d.pr)}</span></div>
    <div class="row">Betweenness <span>${formatNum(d.bc)}</span></div>
    <div class="row">Out-degree <span>${d.deg}</span></div>
    <div class="row">Component <span>${escapeHtml(d.comp)}</span></div>`;
}

function edgeTooltipHtml(edge) {
  const d = edge.data();
  const source = edge.source().data('ip');
  const target = edge.target().data('ip');
  return `<b>${escapeHtml(source)} → ${escapeHtml(target)}</b>
    <div class="row">Bytes <span>${formatBytes(d.b)}</span></div>
    <div class="row">Packets <span>${formatInt(d.p)}</span></div>`;
}

function renderNode(node) {
  const d = node.data();
  const inDeg = node.indegree();
  const outDeg = node.outdegree();
  const peers = node.connectedEdges().length;

  $('details-title').innerHTML = `${escapeHtml(d.ip)} <span class="badge">node</span>`;
  const info = $('details-info');
  info.dataset.help = 'node';
  info.setAttribute('aria-label', 'What do these numbers mean?');
  $('details-content').innerHTML = `
    <div class="kv"><span class="k">PageRank</span><span class="v">${formatNum(d.pr)}</span></div>
    <div class="kv"><span class="k">Betweenness</span><span class="v">${formatNum(d.bc)}</span></div>
    <div class="kv"><span class="k">Out-degree</span><span class="v">${d.deg}</span></div>
    <div class="kv"><span class="k">In / out in view</span><span class="v">${inDeg} / ${outDeg}</span></div>
    <div class="kv"><span class="k">Edges touching</span><span class="v">${peers}</span></div>
    <div class="kv"><span class="k">Component</span><span class="v">${escapeHtml(d.comp)}</span></div>
    <div class="kv"><span class="k">Vertex id</span><span class="v">${escapeHtml(d.id)}</span></div>
    <p class="hint">Vertex id is CRC32(IP), so it is stable across runs. High betweenness but low degree means a bridge, not a hub. Solid lines are outgoing, dashed lines incoming.</p>`;
}

function renderSummary() {
  const d = state.data;
  if (!d) return;
  const s = d.summary;

  $('details-title').innerHTML =
    `${escapeHtml(d.label)} <span class="badge">graph</span>` + (s.truncated ? '<span class="badge warn">capped</span>' : '');
  const info = $('details-info');
  info.dataset.help = 'summary';
  info.setAttribute('aria-label', 'What do these totals mean?');

  $('details-content').innerHTML = `
    <div class="kv"><span class="k">Vertices</span><span class="v">${formatInt(s.totalVertices)}${s.truncated ? ` (showing ${formatInt(s.shownVertices)})` : ''}</span></div>
    <div class="kv"><span class="k">Directed edges</span><span class="v">${formatInt(s.totalEdges)}${s.truncated ? ` (showing ${formatInt(s.shownEdges)})` : ''}</span></div>
    <div class="kv"><span class="k">Components</span><span class="v">${formatInt(s.components)}</span></div>
    <div class="kv"><span class="k">Packets</span><span class="v">${formatInt(s.packets)}</span></div>
    <div class="kv"><span class="k">Bytes</span><span class="v">${formatBytes(s.bytes)}</span></div>
    <div class="kv"><span class="k">Time windows</span><span class="v">${formatInt(s.windows)}${
      s.windowSeconds ? ` × ${s.windowSeconds}s` : ''
    }</span></div>
    <div class="kv"><span class="k">Max PageRank</span><span class="v">${formatNum(s.maxPageRank)}</span></div>
    <div class="kv"><span class="k">Max betweenness</span><span class="v">${formatNum(s.maxBetweenness)}</span></div>
    <p class="hint">Click a node for its metrics. Drag the edge filter to strip noise, scrub time to watch the attack spread.</p>`;
}

function renderLegend() {
  const counts = new Map();
  state.data.vertices.forEach((v) => counts.set(v.comp, (counts.get(v.comp) || 0) + 1));
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const shown = ordered.length > 10 ? ordered.slice(0, 9) : ordered;

  const hasGateway = state.data.vertices.some((v) => v.ip === GATEWAY_IP);
  const hasScanner = state.data.vertices.some((v) => v.ip === SCANNER_IP);
  const roleRows =
    (hasGateway
      ? `<div class="legend-row"><span class="swatch" style="background:transparent;border:2px solid #f0b429"></span><span>gateway</span></div>`
      : '') +
    (hasScanner
      ? `<div class="legend-row"><span class="swatch" style="background:#c0392b"></span><span>scanner</span></div>`
      : '');

  $('legend-items').innerHTML =
    shown
      .map(
        ([comp, n]) => `<div class="legend-row">
          <span class="swatch" style="background:${state.colours.get(comp)}"></span>
          <span>${comp === ordered[0][0] ? 'main' : String(comp).slice(0, 8)}</span>
          <span class="n">${n}</span>
        </div>`
      )
      .join('') +
    (ordered.length > shown.length
      ? `<div class="legend-row"><span class="swatch" style="background:#3b4a5d"></span><span>${ordered.length - shown.length} more</span></div>`
      : '') +
    roleRows;
}

function renderEdgeLegend() {
  const legend = $('edge-legend');
  if (!legend) return;
  const hasEdges = state.data && state.data.edges.length > 0;
  legend.hidden = !hasEdges;
  if (!hasEdges) return;

  $('edge-ramp').style.background = `linear-gradient(90deg, ${EDGE_RAMP.join(', ')})`;
  $('edge-low').textContent = `low ${formatLegendBytes(state.edgeScale.min)}`;
  $('edge-high').textContent = `high ${formatLegendBytes(state.edgeScale.max)}`;
}

/* ---------- controls ---------- */

function bindControls() {
  $('metric').addEventListener('change', (e) => {
    state.metric = e.target.value;
    syncUrl();
    if (!state.cy) return;
    state.cy.nodes().forEach((n) => n.data('sz', nodeSize(n.data())));
    state.cy.nodes().style('width', (n) => n.data('sz'));
    state.cy.nodes().style('height', (n) => n.data('sz'));
  });

  $('threshold').addEventListener('input', (e) => {
    state.threshold = Number(e.target.value);
    updateThresholdLabel();
    applyFilters();
    syncUrl();
  });

  $('window').addEventListener('input', (e) => {
    stopPlay();
    setWindowIndex(Number(e.target.value));
  });

  $('search').addEventListener('input', (e) => searchNode(e.target.value));
  $('search').addEventListener('change', (e) => searchNode(e.target.value));

  $('fit').addEventListener('click', () => state.cy && state.cy.fit(undefined, 40));

  const zoomBy = (factor) => {
    const cy = state.cy;
    if (!cy) return;
    const level = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor));
    cy.zoom({
      level,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 }
    });
  };
  $('zoom-in').addEventListener('click', () => zoomBy(1.25));
  $('zoom-out').addEventListener('click', () => zoomBy(0.8));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.focusedIp) {
      e.preventDefault();
      clearFocus();
      return;
    }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const cy = state.cy;
    if (!cy) return;
    const step = 80;
    const moves = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step]
    };
    if (moves[e.key]) {
      e.preventDefault();
      const p = cy.pan();
      cy.pan({ x: p.x + moves[e.key][0], y: p.y + moves[e.key][1] });
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomBy(1.25);
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      zoomBy(0.8);
    }
  });

  $('relayout').addEventListener('click', () => {
    if (!state.cy) return;
    state.cy.layout(layoutOptions(state.data.vertices.length)).run();
  });

  $('labels-toggle').addEventListener('click', () => {
    state.showLabels = !state.showLabels;
    $('labels-toggle').classList.toggle('on', state.showLabels);
    applyLabelVisibility();
  });

  $('play').addEventListener('click', togglePlay);

  $('share').addEventListener('click', copyLink);

  $('png').addEventListener('click', () => {
    if (!state.cy) return;
    const uri = state.cy.png({ full: true, scale: 2, bg: '#0e1116' });
    const a = document.createElement('a');
    a.href = uri;
    a.download = `${state.data.slug}-graph.png`;
    a.click();
  });
}

/* Labels are a class, not a stylesheet rewrite: only undimmed nodes carry
   them, so a focus or hover shows text just for the device and its neighbours.
   Rewriting the stylesheet here appended a rule on every call and left labels
   on dimmed nodes. */
function applyLabelVisibility() {
  const cy = state.cy;
  if (!cy) return;
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const on = state.showLabels && !node.hasClass('dim');
      node.toggleClass('labelled', on);
    });
  });
}

function resetWindowSlider(data) {
  const n = data.windows.length;
  const slider = $('window');
  slider.max = String(n);
  slider.value = '0';
  slider.disabled = n <= 1;
  updateWindowLabel();
}

/* ---------- playback ---------- */

const PlayStepMs = 900;

/** Single entry point for changing windows, so slider and state never drift. */
function setWindowIndex(i) {
  const previousFocus = state.focusedIp;
  state.windowIndex = i;
  const slider = $('window');
  if (slider.value !== String(i)) slider.value = String(i);
  updateWindowLabel();
  applyFilters();

  if (previousFocus) {
    const node = findNodeByIp(previousFocus);
    if (node) {
      // Keep the focus, but do not yank the view back while scrubbing or playing.
      focusNode(previousFocus, { center: false, syncSearch: false });
    } else {
      clearFocus({ note: `${previousFocus} is not in this time window; focus cleared.` });
    }
  }
  syncUrl();
}

function togglePlay() {
  if (state.playing) {
    stopPlay();
    return;
  }
  if (!state.cy || !state.data || state.data.windows.length < 2) return;

  state.playing = true;
  $('play').textContent = 'Stop';
  $('play').classList.add('on');

  const n = state.data.windows.length;
  if (state.windowIndex === 0 || state.windowIndex >= n) setWindowIndex(1);

  state.timer = setInterval(() => {
    if (state.windowIndex >= state.data.windows.length) {
      stopPlay();
      return;
    }
    setWindowIndex(state.windowIndex + 1);
  }, PlayStepMs);
}

function stopPlay() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.playing = false;
  $('play').textContent = 'Play';
  $('play').classList.remove('on');
}

function updateWindowLabel() {
  const w = state.data.windows;
  if (!state.data || w.length === 0) {
    $('window-val').textContent = 'no windows';
    return;
  }
  if (state.windowIndex === 0) {
    $('window-val').textContent = `all (${w.length})`;
  } else {
    const win = w[state.windowIndex - 1];
    $('window-val').textContent = `${state.windowIndex}/${w.length} ${formatClock(win.w)}`;
  }
}

function updateThresholdLabel() {
  const edges = state.data ? state.data.edges : [];
  if (!edges.length) { $('threshold-val').textContent = ''; return; }
  const sorted = edges.map((e) => e.b).sort((a, b) => a - b);
  const idx = Math.floor((state.threshold / 100) * (sorted.length - 1));
  $('threshold-val').textContent = state.threshold === 0 ? 'off' : `≥ ${formatBytes(sorted[idx])}`;
}

function applyFilters() {
  const cy = state.cy;
  if (!cy) return;

  const edges = state.data.edges;
  const sorted = edges.map((e) => e.b).sort((a, b) => a - b);
  const byteCut =
    state.threshold === 0 || sorted.length === 0
      ? 0
      : sorted[Math.floor((state.threshold / 100) * (sorted.length - 1))];

  const win = state.windowIndex === 0 ? null : state.data.windows[state.windowIndex - 1];
  // Aggregate edges and window edges carry different packet/byte totals, so
  // the pair (src -> dst) is the only stable identity across both.
  const allowed = new Set();
  if (win) win.edges.forEach((e) => allowed.add(`${e.s}|${e.t}`));

  let visible = 0;
  cy.edges().forEach((edge) => {
    const d = edge.data();
    const inWindow = !win || allowed.has(`${d.source}|${d.target}`);
    const above = d.b >= byteCut;
    const show = inWindow && above;
    edge.style('display', show ? 'element' : 'none');
    if (show) visible += 1;
  });

  const visibleNodes = cy.nodes().filter((n) => n.style('display') !== 'none').length;
  $('empty').hidden = visibleNodes > 0;
  updateCounts(visible, visibleNodes);
}

function updateCounts(visible, visibleNodes) {
  const cy = state.cy;
  if (!cy) return;
  const v = visible === undefined ? cy.edges().filter((e) => e.style('display') !== 'none').length : visible;
  const n = visibleNodes === undefined
    ? cy.nodes().filter((node) => node.style('display') !== 'none').length
    : visibleNodes;
  $('counts-text').textContent =
    `${n} nodes · ${v} edges shown` + (state.showLabels ? '' : ' · labels off');
}

function searchNode(query) {
  const q = query.trim().toLowerCase();
  if (!state.cy) return;

  if (!q) {
    clearFocus({ clearSearch: false });
    return;
  }

  const matches = state.cy.nodes().filter((n) => String(n.data('ip')).toLowerCase().includes(q));
  if (matches.length === 0) {
    clearFocus({ clearSearch: false });
    return;
  }

  // Exact address wins over a substring hit: typing 192.168.137.1 must not
  // select 192.168.137.175 just because it was laid out first.
  const exact = matches.filter((n) => String(n.data('ip')).toLowerCase() === q);
  const prefix = matches.filter((n) => String(n.data('ip')).toLowerCase().startsWith(q));
  const pool = (exact.length ? exact : prefix.length ? prefix : matches).toArray();
  const node = pool.sort((a, b) => b.data('pr') - a.data('pr'))[0];
  focusNode(node.data('ip'), { syncSearch: false });
}

function populateIps(data) {
  const ips = data.vertices.slice(0, 800).map((v) => v.ip);
  $('ip-list').innerHTML = ips.map((ip) => `<option value="${escapeHtml(ip)}">`).join('');
}

/* ---------- formatting ---------- */

function formatInt(n) {
  if (n === undefined || n === null) return '—';
  return Number(n).toLocaleString();
}

function formatNum(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  if (n === 0) return '0';
  if (Math.abs(n) >= 100) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(3);
  return n.toPrecision(3);
}

function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/* The traffic legend is always expressed in KB or larger. */
function formatLegendBytes(n) {
  const units = ['KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = Math.max(0, Number(n) || 0) / 1024;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function formatClock(epochSeconds) {
  return new Date(epochSeconds * 1000).toLocaleTimeString();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
