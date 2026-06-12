import {
  dH as $,
  r as t,
  j as r
} from "./index-CsG73Aq_.js";
const z = new Set(["selectedTicker", "pairTickerA", "pairTickerB", "results", "gridResults",
  "expandedTicker", "expandedGridTicker", "sortBy", "runSort", "gridLongSort", "gridShortSort",
  "evalResult", "evalTriggerKey", "evalFilterKeys"
]);

function F(k) {
  const d = {};
  for (const [l, p] of Object.entries(k)) z.has(l) || (d[l] = p);
  return d
}

function U({
  kind: k,
  captureInputs: d,
  applyInputs: l
}) {
  const p = $(k),
    i = p.presets ?? [],
    {
      addPreset: S,
      updatePreset: w,
      deletePreset: R
    } = p,
    [o, x] = t.useState(""),
    [c, m] = t.useState(!1),
    [f, b] = t.useState(""),
    [g, s] = t.useState(!1),
    [h, u] = t.useState(""),
    [T, a] = t.useState(!1),
    [E, D] = t.useState(null),
    y = t.useRef(null),
    v = t.useRef(null),
    N = t.useRef(null);
  t.useEffect(() => {
    o && !i.find(e => e.id === o) && x("")
  }, [i, o]), t.useEffect(() => {
    c && v.current && v.current.focus()
  }, [c]), t.useEffect(() => {
    g && N.current && N.current.focus()
  }, [g]);
  const n = i.find(e => e.id === o),
    K = t.useCallback(() => {
      n && (l(n.inputs), D(n.name), y.current && clearTimeout(y.current), y.current = setTimeout(
      () => D(null), 2e3))
    }, [n, l]),
    j = t.useCallback(() => {
      const e = f.trim();
      if (!e) return;
      const L = d(),
        O = F(L),
        Y = S(e, O);
      x(Y.id), m(!1), b("")
    }, [f, d, S]),
    A = t.useCallback(e => {
      e.key === "Enter" && j(), e.key === "Escape" && (m(!1), b(""))
    }, [j]),
    B = t.useCallback(() => {
      n && (u(n.name), s(!0), a(!1))
    }, [n]),
    C = t.useCallback(() => {
      const e = h.trim();
      if (!e || !n) {
        s(!1);
        return
      }
      w(n.id, {
        name: e
      }), s(!1), u("")
    }, [h, n, w]),
    I = t.useCallback(e => {
      e.key === "Enter" && C(), e.key === "Escape" && (s(!1), u(""))
    }, [C]),
    H = t.useCallback(() => {
      n && (R(n.id), x(""), a(!1))
    }, [n, R]),
    P = i.length > 0;
  return r.jsxs("div", {
    className: "flex items-center gap-2 px-4 py-1.5 border-b border-border bg-card/80 flex-wrap",
    children: [r.jsx("span", {
      className: "text-[10px] font-mono text-muted-foreground font-semibold shrink-0",
      children: "Presets:"
    }), r.jsxs("select", {
      className: "text-[10px] font-mono bg-background border border-border rounded px-2 py-0.5 text-foreground max-w-[160px] min-w-[120px] disabled:opacity-50",
      value: o,
      onChange: e => {
        x(e.target.value), s(!1), a(!1)
      },
      disabled: !P,
      children: [r.jsx("option", {
        value: "",
        children: P ? "— select preset —" : "No presets saved"
      }), i.map(e => r.jsx("option", {
        value: e.id,
        children: e.name
      }, e.id))]
    }), r.jsx("button", {
      className: "text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-background text-foreground hover:bg-accent disabled:opacity-40 transition-colors shrink-0",
      onClick: K,
      disabled: !o,
      title: "Apply selected preset",
      children: "Apply"
    }), E && r.jsxs("span", {
      className: "text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-in fade-in shrink-0",
      children: ["Applied: ", E]
    }), c ? r.jsxs("span", {
      className: "flex items-center gap-1 shrink-0",
      children: [r.jsx("input", {
        ref: v,
        className: "text-[10px] font-mono bg-background border border-primary rounded px-2 py-0.5 text-foreground w-[140px] outline-none",
        placeholder: "Preset name…",
        value: f,
        onChange: e => b(e.target.value),
        onKeyDown: A
      }), r.jsx("button", {
        className: "text-[10px] font-mono px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
        onClick: j,
        disabled: !f.trim(),
        children: "Save"
      }), r.jsx("button", {
        className: "text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground transition-colors",
        onClick: () => {
          m(!1), b("")
        },
        children: "✕"
      })]
    }) : r.jsx("button", {
      className: "text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-background text-foreground hover:bg-accent transition-colors shrink-0",
      onClick: () => {
        m(!0), s(!1), a(!1)
      },
      title: "Save current inputs as a new preset",
      children: "Save current…"
    }), o && !c && (g ? r.jsxs("span", {
      className: "flex items-center gap-1 shrink-0",
      children: [r.jsx("input", {
        ref: N,
        className: "text-[10px] font-mono bg-background border border-primary rounded px-2 py-0.5 text-foreground w-[140px] outline-none",
        placeholder: "New name…",
        value: h,
        onChange: e => u(e.target.value),
        onKeyDown: I
      }), r.jsx("button", {
        className: "text-[10px] font-mono px-2 py-0.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors",
        onClick: C,
        disabled: !h.trim(),
        children: "Save"
      }), r.jsx("button", {
        className: "text-[10px] font-mono px-2 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground transition-colors",
        onClick: () => {
          s(!1), u("")
        },
        children: "✕"
      })]
    }) : r.jsx("button", {
      className: "text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground transition-colors shrink-0",
      onClick: B,
      title: `Rename "${n?.name}"`,
      children: "✏"
    })), o && !c && !g && (T ? r.jsxs("span", {
      className: "flex items-center gap-1 shrink-0 bg-red-500/10 border border-red-500/30 rounded px-2 py-0.5",
      children: [r.jsxs("span", {
        className: "text-[10px] font-mono text-red-400",
        children: ['Delete "', n?.name, '"?']
      }), r.jsx("button", {
        className: "text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 transition-colors",
        onClick: H,
        children: "Yes"
      }), r.jsx("button", {
        className: "text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-foreground transition-colors",
        onClick: () => a(!1),
        children: "No"
      })]
    }) : r.jsx("button", {
      className: "text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-background text-muted-foreground hover:text-red-400 transition-colors shrink-0",
      onClick: () => a(!0),
      title: `Delete "${n?.name}"`,
      children: "🗑"
    }))]
  })
}
export {
  U as P
};