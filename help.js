/* In-app help — plain-English explanations for every panel.
   Any element with class "info-btn" and data-help="<key>" opens the matching
   entry below. Add a key to HELP and a button in index.html / app.js. */

const HELP = {
  app: {
    title: 'What this site does',
    body: `
      <p>This page draws a <b>map of who talked to whom</b> in a recorded attack,
      then scores which devices sit in the middle of everyone else's conversations.</p>
      <p><b>Dots</b> are IP addresses. <b>Lines</b> are conversations, and the arrow
      shows who sent data to whom.</p>
      <p>It works on recordings that have already been captured — it is not watching
      a network live.</p>
      <p>Start on the left: pick an attack label. Hover a dot for its numbers, click
      it to pin them on the right.</p>`
  },

  meta: {
    title: 'Labels and build date',
    body: `
      <p>How many attack recordings are loaded, and when the data files were last
      produced by the Spark job.</p>
      <p>If a fresh analysis run looks missing, check this date first.</p>`
  },

  labels: {
    title: 'Attack labels',
    body: `
      <p>Each button is one <b>recording</b> from the CICIoT2023 dataset. The folder
      name is the label, so <b>Benign_Final</b> is ordinary traffic and the others
      are attacks.</p>
      <p>The small line under each name is how many dots (nodes) and lines (edges)
      that recording produced.</p>
      <p>Click one to rebuild the map. A flood and a scan produce very different
      shapes from normal traffic, which is the point.</p>`
  },

  metric: {
    title: 'Size by',
    body: `
      <p>This changes what <b>big</b> means. Dots stay where they are; only their
      size changes.</p>
      <ul>
        <li><b>PageRank</b> — important because important devices talk to it, the
        same idea as web links.</li>
        <li><b>Betweenness</b> — the middle-man score: how often a device sits on
        the shortest path between two other devices.</li>
        <li><b>Out-degree</b> — how many different devices it sent data to.</li>
      </ul>
      <p>Use <b>Betweenness</b> to find the chokepoint. A big dot with low
      betweenness is usually just noisy, not important.</p>`
  },

  threshold: {
    title: 'Min edge bytes',
    body: `
      <p>Hides conversations that carried fewer bytes than the cutoff.
      <b>off</b> shows everything.</p>
      <p>Slide right to strip background chatter and keep only the heavy
      conversations. The label shows the byte size you are cutting below.</p>
      <p>The colour and thickness scale stays fixed while you move this slider;
      only which lines are visible changes.</p>
      <p>Careful: a port scan sends tiny packets, so a high filter can delete the
      attack you are looking for.</p>`
  },

  window: {
    title: 'Time window',
    body: `
      <p>The recording cut into <b>one-minute slices</b>. <b>all</b> means the whole
      capture squashed into one picture.</p>
      <p>Move right to step through time, or press <b>Play</b>. Early windows are
      often empty because the attack had not started yet.</p>
      <p>Caveat: only the lines are rebuilt per minute. Dot sizes are still
      whole-capture scores, so dots do not grow or shrink as you scrub.</p>`
  },

  search: {
    title: 'Find IP',
    body: `
      <p>Type an IP address, or part of one, to focus that device. An exact match
      wins over a partial one. Clicking a dot on the map does exactly the same
      thing and fills this box for you.</p>
      <p>The map dims everything else, keeps the device and its direct neighbours
      visible, centres it and shows its numbers on the right. Solid lines are
      outgoing, dashed lines incoming.</p>
      <p>Clear the box, press <b>Escape</b>, or click the empty background to return
      to the whole graph.</p>`
  },

  view: {
    title: 'The buttons',
    body: `
      <p><b>Fit</b> — zoom so the whole map is visible. <b>&minus; / +</b> zoom out
      and in; the mouse wheel or a trackpad pinch does the same.</p>
      <p><b>Drag</b> anywhere on the map — including on a dot — to move the view.
      The arrow keys also move it.</p>
      <p><b>Re-layout</b> — redraw the map with a fresh layout. The shape itself
      means nothing; only the connections do.</p>
      <p><b>Labels</b> — show or hide IP addresses on the dots.</p>
      <p><b>Play</b> — step through the time windows automatically.</p>
      <p><b>Copy link</b> — copy a URL that reopens this capture, window and
      focused host. The address bar updates as you work, so it is always
      shareable.</p>
      <p><b>PNG</b> — download the current view as an image.</p>`
  },

  graph: {
    title: 'Reading the map',
    body: `
      <p><b>Dots</b> are IP addresses. <b>Lines</b> are conversations, with an arrow
      showing who sent to whom. <b>Both the colour and the thickness</b> of a line
      show how much data the conversation carried: dim blue and thin means light
      traffic, bright yellow and thick means heavy traffic. Both use the same log
      scale, fixed for the whole attack label.</p>
      <p>Dot <b>size</b> follows the metric chosen above. Dot <b>colour</b> groups
      devices that can reach each other — see Components, bottom right.</p>
      <p>The main island is blue. Extra islands get their own colour only when
      they exist. A gold ring marks the gateway, red marks the scanner. A focused
      device has a white outline with a cyan glow.</p>
      <p>Click a dot, or type its IP in <b>Find IP</b>, to focus it: the rest of the
      map dims, the device and its direct neighbours stay visible, and its numbers
      appear on the right. Solid lines are outgoing, dashed lines incoming. Press
      <b>Escape</b>, clear the box, or click the background to unfocus.</p>
      <p>Hover a dot for PageRank, betweenness, out-degree and its component.
      Hover a line for its source, destination, bytes and packets.</p>`
  },

  summary: {
    title: 'Graph summary',
    body: `
      <p>The whole capture, before any filters:</p>
      <ul>
        <li><b>Vertices</b> — number of distinct IP addresses (dots).</li>
        <li><b>Directed edges</b> — number of distinct who-sent-to-whom pairs
        (lines).</li>
        <li><b>Components</b> — separate islands of devices. 1 means everything is
        connected.</li>
        <li><b>Packets / Bytes</b> — total traffic behind those lines.</li>
        <li><b>Time windows</b> — how many one-minute slices the recording was cut
        into.</li>
        <li><b>Max PageRank / Max betweenness</b> — the highest score in this graph,
        i.e. what the biggest dot represents.</li>
      </ul>
      <p><b>capped</b> means the picture shows only the strongest part of a very
      large graph; the totals are still the real totals.</p>`
  },

  node: {
    title: 'This device',
    body: `
      <p>Figures for one device, from the whole capture:</p>
      <ul>
        <li><b>PageRank</b> — importance by association.</li>
        <li><b>Betweenness</b> — how often it sits on the shortest path between two
        others, the middle-man score.</li>
        <li><b>Out-degree</b> — how many devices it sent data to.</li>
        <li><b>In / out in view</b> — arrows currently drawn, after the time and
        byte filters.</li>
        <li><b>Edges touching</b> — conversations involving it in the current
        view.</li>
        <li><b>Component</b> — which island it belongs to.</li>
        <li><b>Vertex id</b> — CRC32 of the IP, a stable internal ID.</li>
      </ul>
      <p><b>High betweenness with low degree means a bridge, not a hub.</b> That is
      the kind of device worth watching or isolating first.</p>`
  },

  legend: {
    title: 'Components',
    body: `
      <p>Colour tells you which <b>island</b> (connected component) a device is in:
      two dots of the same colour can reach each other.</p>
      <p><b>main</b> is the biggest island. The number on the right is how many
      devices are in it.</p>
      <p>Normal traffic here is one island. Floods usually break into two or three:
      the router, the target and the sender.</p>`
  },

  counts: {
    title: 'Visible totals',
    body: `
      <p>How many dots and lines are visible right now, after the byte filter and
      the time window.</p>
      <p>The whole-graph totals are on the right, under <b>Vertices</b> and
      <b>Directed edges</b>.</p>`
  }
};

(function () {
  let pop = null;
  let anchor = null;

  function close() {
    if (anchor) anchor.setAttribute('aria-expanded', 'false');
    if (pop) pop.remove();
    pop = null;
    anchor = null;
  }

  function place(btn) {
    const pad = 10;
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;

    let left = r.left + r.width / 2 - w / 2;
    left = Math.min(Math.max(pad, left), window.innerWidth - w - pad);

    let top = r.bottom + 8;
    if (top + h > window.innerHeight - pad) top = Math.max(pad, r.top - h - 8);

    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function open(btn) {
    const entry = HELP[btn.dataset.help];
    if (!entry) return;

    close();
    anchor = btn;

    pop = document.createElement('div');
    pop.className = 'info-pop';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', entry.title);
    pop.innerHTML = `
      <button class="info-close" type="button" aria-label="Close">×</button>
      <h4>${entry.title}</h4>
      ${entry.body}`;
    document.body.appendChild(pop);

    btn.setAttribute('aria-expanded', 'true');
    pop.querySelector('.info-close').addEventListener('click', close);
    place(btn);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.info-btn');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      if (anchor === btn) close();
      else open(btn);
      return;
    }
    if (pop && !e.target.closest('.info-pop')) close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && pop) {
      const back = anchor;
      close();
      if (back) back.focus();
    }
  });

  window.addEventListener('resize', close);
  document.addEventListener('scroll', close, true);
})();
