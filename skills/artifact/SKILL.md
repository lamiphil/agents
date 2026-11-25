---
name: artifact
description: Style Pi artifacts (pi-artifacts HTML pages) with Philippe's portfolio look (dark, main-green #03C03C, Raleway) and draw architecture sketches with role-coloured zones, kind-coloured edges and numbered dataflow. Use for personal or non-Vooban artifacts, homelab / Kubernetes cluster architecture diagrams, or when the user asks for the portfolio / personal style.
---

# artifact

Layered on top of `artifact-designer`: same `artifact_*` tools and `.pi-*` classes,
different skin. Same diagram model as `vooban-artifact` sketches (`.vd-*`), in the
portfolio palette. For Vooban or client work use `vooban-artifact` instead.

Source of the look: `~/workspaces/perso/repos/portfolio` (`tailwind.config.ts`,
`src/app/globals.css`, `AGENTS.md` « Styling Conventions »). Read it when a rule here is unclear.

Bundled: `assets/portfolio.css` (theme), `assets/raleway-latin.woff2` (the exact file the
site serves; SIL OFL, safe to embed), `assets/vd-edges.js` (edge router),
`assets/example-diagram.html` (reference fragment), `scripts/apply-theme.py`.

## Workflow

1. `artifact_create`, then write `source/index.html` with content inside
   `<main class="pi-shell">`. Put artifact-specific CSS in the `<style>` block
   after a `/* artifact */` marker; everything before it is replaced.
2. Apply the theme (idempotent, re-run after every edit):
   `~/.agents/skills/artifact/scripts/apply-theme.py <dir>/source/index.html [--lang en|fr]`
3. Look at it. Screenshot and inspect:
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --window-size=1600,900 --virtual-time-budget=2000 --screenshot=<png> file://<dir>/source/index.html`.
   Check: no edge through a box or a title, no label on a node, reading order left→right.
   Write the PNG under `~/.cache/`, not `/tmp`, so the image reader can open it.
4. `artifact_validate`, then `artifact_preview`. Publish only when asked, and confirm
   first: a temporary Cloudflare deploy is public.

## Page chrome

- **Dark only.** Background `#0A0A0A`; never add a light variant.
- **One accent:** main-green `#03C03C` for links, highlights (`.highlight`), primary buttons,
  active tabs, metric values. Text on green is `#041008`. Don't introduce other accent colours
  in chrome; the amber/blue/purple tints belong to diagram roles only.
- **Text opacity, not greys:** primary `white/90`, secondary `white/75`, muted `white/40`
  (`--pf-text`, `--pf-text-2`, `--pf-muted`). Borders `white/10` (`--pf-line`).
- **Fibonacci spacing:** 5, 8, 13, 21, 34, 55, 89 px for any spacing you add in artifact CSS.
- `.pf-eyebrow` (mono, uppercase, green) above `.pi-title`; `.pf-meta` for dates/IDs;
  `.pf-tag` for the site's green pill tags (tech stack, keywords).
- Default language English; the site is bilingual, so French is fine when asked (`--lang fr`).
- No gradients, glows or animated effects (the site's meteors/border-beam don't belong in documents).

## Sketch diagrams

Structure, copied from `assets/example-diagram.html`:

```html
<section class="vd-canvas">
  <h2 class="vd-title">…</h2><p class="vd-subtitle">…</p>
  <div class="vd-layout">
    <svg class="vd-edges" aria-hidden="true" data-edges='[{"from":"a","to":"b","kind":"call","label":"HTTPS","step":1}]'></svg>
    <div class="vd-zone vd-source"><p class="vd-zone-title">Clients</p> …nodes… </div>
    … zones nest; use .vd-row / .vd-col inside …
    <aside class="vd-zone vd-plain vd-dataflow"><p class="vd-zone-title">Dataflow</p><ol class="vd-steps">…</ol></aside>
  </div>
</section>
```

- **Roles set colour; never pick a colour by hand.** `vd-source` (green, users/clients),
  `vd-external` (amber), `vd-cloud` (blue), `vd-shared` (zinc), `vd-project` (purple),
  `vd-logical` (dashed); structural frames `vd-tenant`, `vd-subnet`, `vd-reserved`, `vd-plain`, `vd-note`.
- **Nodes:** `.vd-node` (box) or `.vd-icon-node` (44px icon over a bold label) with an optional
  `<span class="vd-sub">` line. Every edge endpoint needs an `id`.
- **Edge kinds carry meaning:** `call`/`peering` green, `data`/`manual` amber,
  `identity`/`telemetry`/`return` grey dashed. Never add another meaning for a colour.
- **Numbered dataflow:** give the main path's edges `step` numbers and explain each in
  `.vd-steps` with the matching badge (`.vd-badge`, `-data` amber, `-quiet` grey).
- **Routing knobs** when the screenshot shows a collision: `route: "over"|"under"` + `lane`,
  `offset` (moves the bend), `dx1/dx2/dy1/dy2` (move the attach points).
- Legend (`.vd-legend`) has at most 4 entries; a one-line `.vd-footnote` usually replaces it.
- **Icons:** inline SVG only (the portfolio's `public/logos/*.svg` are a good local source). No remote URLs.
- One picture per question asked; split dense views rather than shrinking them.

## Homelab cluster diagrams

Map the cluster onto the same roles so colours stay meaningful:

- `vd-source`: clients (LAN devices, VPN/Tailscale peers). `vd-external`: internet, DNS/registrar, cloud backups.
- `vd-tenant`: the physical site or rack; `vd-subnet`: a VLAN or subnet (put the CIDR in the title).
- `vd-cloud`: the cluster; nest one `vd-plain` per node (host name, CPU/RAM, IP in `.vd-sub`),
  or `vd-project` per namespace when the picture is about workloads, not hardware.
- `vd-shared`: storage and platform services (NAS, Longhorn/Ceph, ingress, cert-manager, monitoring).
- Edges: `call` for ingress → service traffic, `data` for storage and backups, `telemetry` for
  metrics/logs, `identity` for SSO/OIDC. Number the main request path.
- Gather facts before drawing: ask, or read them from the cluster (`kubectl get nodes -o wide`,
  `kubectl get ingress,svc -A`) if a kubeconfig is set. Never invent IPs or hostnames.
- Icons: `kubernetes.svg`, `docker.svg`, `grafana.svg`, `prometheus.svg`, `linux.svg` … from
  `~/workspaces/perso/repos/portfolio/public/logos/`, inlined.
