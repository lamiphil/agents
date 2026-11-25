// Draws orthogonal, kind-coloured edges for every <svg class="vd-edges" data-edges='[...]'>.
// Edge: { from, to, kind?, label?, step?, route?, lane?, offset?, dx1?, dx2?, dy1?, dy2? } — from/to are element ids.
// route: "auto" (default, Z-shaped) | "over" | "under" (leave the top/bottom edges and run in a lane
// `lane` px outside the layout, like the identity line in the architects' pictures).
// kind: call | peering | data | manual | identity | telemetry | return (portfolio palette: call green, data amber, quiet zinc).
(() => {
  const COLORS = { call: "#03C03C", peering: "#03C03C", data: "#E88C30", manual: "#E88C30", identity: "#71717A", telemetry: "#71717A", return: "#71717A" };
  const ON = { call: "#041008", peering: "#041008", data: "#1A0F02", manual: "#1A0F02", identity: "#FFFFFF", telemetry: "#FFFFFF", return: "#FFFFFF" };
  const NS = "http://www.w3.org/2000/svg";
  const el = (name, attrs) => { const e = document.createElementNS(NS, name); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  function draw(svg, idx) {
    const box = svg.parentElement.getBoundingClientRect();
    svg.querySelectorAll("[data-vd]").forEach((n) => n.remove());
    svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    const defs = el("defs", { "data-vd": "" });
    for (const [kind, color] of Object.entries(COLORS)) {
      const open = kind === "return";
      const m = el("marker", { id: `vd${idx}-${kind}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
      m.append(el("path", { d: open ? "M0,0 L10,5 L0,10" : "M0,0 L10,5 L0,10 z", fill: open ? "none" : color, stroke: color, "stroke-width": 1.2 }));
      defs.append(m);
    }
    svg.append(defs);

    const rel = (r) => ({ l: r.left - box.left, r: r.right - box.left, t: r.top - box.top, b: r.bottom - box.top, cx: (r.left + r.right) / 2 - box.left, cy: (r.top + r.bottom) / 2 - box.top });
    for (const e of JSON.parse(svg.dataset.edges || "[]")) {
      const a = document.getElementById(e.from), b = document.getElementById(e.to);
      if (!a || !b) { console.warn("vd-edges: missing node", e); continue; }
      const A = rel(a.getBoundingClientRect()), B = rel(b.getBoundingClientRect());
      let pts;
      if (e.route === "over" || e.route === "under") {
        const over = e.route === "over", lane = over ? -(e.lane || 12) : box.height + (e.lane || 12);
        const x1 = A.cx + (e.dx1 || 0), x2 = B.cx + (e.dx2 || 0);
        pts = [[x1, over ? A.t : A.b], [x1, lane], [x2, lane], [x2, over ? B.t : B.b]];
      } else if (A.r <= B.l || B.r <= A.l) {
        const ltr = A.r <= B.l, x1 = ltr ? A.r : A.l, x2 = ltr ? B.l : B.r, mx = (x1 + x2) / 2 + (e.offset || 0);
        const y1 = A.cy + (e.dy1 || 0), y2 = B.cy + (e.dy2 || 0);
        pts = Math.abs(y1 - y2) < 1 ? [[x1, y1], [x2, y1]] : [[x1, y1], [mx, y1], [mx, y2], [x2, y2]];
      } else {
        const ttb = A.b <= B.t, y1 = ttb ? A.b : A.t, y2 = ttb ? B.t : B.b, my = (y1 + y2) / 2 + (e.offset || 0);
        const x1 = A.cx + (e.dx1 || 0), x2 = B.cx + (e.dx2 || 0);
        pts = Math.abs(x1 - x2) < 1 ? [[x1, y1], [x1, y2]] : [[x1, y1], [x1, my], [x2, my], [x2, y2]];
      }
      const kind = COLORS[e.kind] ? e.kind : "call";
      const path = el("path", { "data-vd": "", class: `vd-edge vd-edge-${kind}`, d: "M" + pts.map((p) => p.join(",")).join(" L"), "marker-end": `url(#vd${idx}-${kind})` });
      if (kind === "peering") path.setAttribute("marker-start", `url(#vd${idx}-${kind})`);
      svg.append(path);

      // Badge sits near the start of the first segment, label right after it (draw.io pictures).
      const [p0, p1] = pts, vertical = Math.abs(p0[0] - p1[0]) < 1;
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), d = len > 70 ? 20 : len / 2;
      const lx = p0[0] + ((p1[0] - p0[0]) / (len || 1)) * d, ly = p0[1] + ((p1[1] - p0[1]) / (len || 1)) * d;
      if (e.step != null) {
        const g = el("g", { "data-vd": "" });
        g.append(el("circle", { cx: lx, cy: ly, r: 11, fill: COLORS[kind] }));
        const t = el("text", { x: lx, y: ly + 4, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: ON[kind], style: "font-family: inherit" });
        t.textContent = e.step;
        g.append(t);
        svg.append(g);
      }
      if (e.label) {
        const shift = e.step != null ? 16 : 0;
        const t = vertical
          ? el("text", { "data-vd": "", class: "vd-edge-label", x: lx + 8 + shift, y: ly + 4, "text-anchor": "start" })
          : el("text", { "data-vd": "", class: "vd-edge-label", x: lx + shift, y: ly - 7, "text-anchor": shift ? "start" : "middle" });
        t.textContent = e.label;
        svg.append(t);
      }
    }
  }

  const all = () => document.querySelectorAll("svg.vd-edges").forEach(draw);
  addEventListener("load", all);
  addEventListener("resize", all);
  if (document.fonts) document.fonts.ready.then(all);
})();
