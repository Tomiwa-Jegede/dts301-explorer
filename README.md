# DTS 301 Attack Graph Explorer

**Live:** https://tomiwa-jegede.github.io/dts301-explorer/

A static explorer for the graph-based cyberattack propagation analytics project
(DTS 301). It turns labelled CICIoT2023 captures into directed IP graphs and
lets you inspect them by time window, host and structural metric.

## What it shows

- Five captures: benign, UDP flood, SYN flood, Mirai GRE flood, port scan.
- One graph per capture and one per 60-second window.
- Degree, PageRank, connected components and sampled betweenness per host.
- Focus mode, traffic-weighted edges, Find IP, PNG export.

## Shareable links

The address bar always reflects the current view, and **Copy link** copies it.
A link can carry:

```
?label=DDoS-UDP_Flood&ip=192.168.137.30&window=10&threshold=20&metric=bc
```

All parameters are optional. `window` is 1-based (`0` or omitted = all windows),
`threshold` is the minimum-edge-bytes slider (0-100), and `metric` is
`pr`, `bc` or `deg`.

## Updating

This repository is a published copy of `ui/` from the main project. To update:

```bash
rsync -a --delete --exclude .DS_Store ui/ /path/to/dts301-explorer/
cd /path/to/dts301-explorer
git add -A && git commit -m "Update explorer" && git push
```

GitHub Pages redeploys automatically from `main`.
