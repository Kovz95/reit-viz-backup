import {
  c as Me,
  cc as U,
  R as P,
  cd as q,
  ce as ue,
  cf as ne,
  cg as de,
  ch as Te,
  ci as W,
  cj as J,
  ck as et,
  cl as ge,
  cm as Se,
  cn as tt,
  co as Fe,
  r as R,
  cp as De,
  cq as re,
  cr as me,
  cs as fe,
  ct as nt,
  cu as Re,
  cv as _e,
  cw as rt,
  cx as at,
  cy as Ie,
  cz as st,
  cA as it,
  cB as ot,
  cC as lt,
  ad as je,
  cD as pe,
  a8 as ze,
  a9 as we,
  cE as ct,
  b as Ke,
  j as a,
  a4 as ut,
  a6 as dt,
  aa as pt,
  a3 as oe,
  a as mt,
  e as ft,
  s as ht,
  f as xt,
  g as yt,
  h as bt,
  o as vt,
  p as gt,
  q as jt,
  t as wt,
  v as Y,
  y as Pt,
  z as At,
  cF as Nt,
  bm as St,
  bn as Ot,
  U as kt
} from "./index-CsG73Aq_.js";
import {
  C as _t
} from "./CartesianGrid-BQtjaw_K.js";
import {
  M as Et
} from "./minus-5wV5xQkh.js";
import {
  A as $t
} from "./arrow-up-down-CNMI3GZb.js";
const Bt = Me("ThumbsDown", [
  ["path", {
    d: "M17 14V2",
    key: "8ymqnk"
  }],
  ["path", {
    d: "M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z",
    key: "m61m77"
  }]
]);
const Ct = Me("ThumbsUp", [
  ["path", {
    d: "M7 10v12",
    key: "1qc93n"
  }],
  ["path", {
    d: "M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z",
    key: "emmmcr"
  }]
]);
var Mt = ["layout", "type", "stroke", "connectNulls", "isRange", "ref"],
  Tt = ["key"],
  Le;

function ae(e) {
  "@babel/helpers - typeof";
  return ae = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(t) {
    return typeof t
  } : function(t) {
    return t && typeof Symbol == "function" && t.constructor === Symbol && t !== Symbol
      .prototype ? "symbol" : typeof t
  }, ae(e)
}

function He(e, t) {
  if (e == null) return {};
  var r = Ft(e, t),
    n, s;
  if (Object.getOwnPropertySymbols) {
    var i = Object.getOwnPropertySymbols(e);
    for (s = 0; s < i.length; s++) n = i[s], !(t.indexOf(n) >= 0) && Object.prototype
      .propertyIsEnumerable.call(e, n) && (r[n] = e[n])
  }
  return r
}

function Ft(e, t) {
  if (e == null) return {};
  var r = {};
  for (var n in e)
    if (Object.prototype.hasOwnProperty.call(e, n)) {
      if (t.indexOf(n) >= 0) continue;
      r[n] = e[n]
    } return r
}

function Q() {
  return Q = Object.assign ? Object.assign.bind() : function(e) {
    for (var t = 1; t < arguments.length; t++) {
      var r = arguments[t];
      for (var n in r) Object.prototype.hasOwnProperty.call(r, n) && (e[n] = r[n])
    }
    return e
  }, Q.apply(this, arguments)
}

function Ee(e, t) {
  var r = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var n = Object.getOwnPropertySymbols(e);
    t && (n = n.filter(function(s) {
      return Object.getOwnPropertyDescriptor(e, s).enumerable
    })), r.push.apply(r, n)
  }
  return r
}

function Z(e) {
  for (var t = 1; t < arguments.length; t++) {
    var r = arguments[t] != null ? arguments[t] : {};
    t % 2 ? Ee(Object(r), !0).forEach(function(n) {
      G(e, n, r[n])
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object
      .getOwnPropertyDescriptors(r)) : Ee(Object(r)).forEach(function(n) {
      Object.defineProperty(e, n, Object.getOwnPropertyDescriptor(r, n))
    })
  }
  return e
}

function Dt(e, t) {
  if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function")
}

function $e(e, t) {
  for (var r = 0; r < t.length; r++) {
    var n = t[r];
    n.enumerable = n.enumerable || !1, n.configurable = !0, "value" in n && (n.writable = !0),
      Object.defineProperty(e, We(n.key), n)
  }
}

function Rt(e, t, r) {
  return t && $e(e.prototype, t), r && $e(e, r), Object.defineProperty(e, "prototype", {
    writable: !1
  }), e
}

function It(e, t, r) {
  return t = he(t), zt(e, Ve() ? Reflect.construct(t, r || [], he(e).constructor) : t.apply(e, r))
}

function zt(e, t) {
  if (t && (ae(t) === "object" || typeof t == "function")) return t;
  if (t !== void 0) throw new TypeError("Derived constructors may only return object or undefined");
  return Kt(e)
}

function Kt(e) {
  if (e === void 0) throw new ReferenceError(
    "this hasn't been initialised - super() hasn't been called");
  return e
}

function Ve() {
  try {
    var e = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}))
  } catch {}
  return (Ve = function() {
    return !!e
  })()
}

function he(e) {
  return he = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function(r) {
    return r.__proto__ || Object.getPrototypeOf(r)
  }, he(e)
}

function Lt(e, t) {
  if (typeof t != "function" && t !== null) throw new TypeError(
    "Super expression must either be null or a function");
  e.prototype = Object.create(t && t.prototype, {
    constructor: {
      value: e,
      writable: !0,
      configurable: !0
    }
  }), Object.defineProperty(e, "prototype", {
    writable: !1
  }), t && Pe(e, t)
}

function Pe(e, t) {
  return Pe = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function(n, s) {
    return n.__proto__ = s, n
  }, Pe(e, t)
}

function G(e, t, r) {
  return t = We(t), t in e ? Object.defineProperty(e, t, {
    value: r,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : e[t] = r, e
}

function We(e) {
  var t = Ht(e, "string");
  return ae(t) == "symbol" ? t : t + ""
}

function Ht(e, t) {
  if (ae(e) != "object" || !e) return e;
  var r = e[Symbol.toPrimitive];
  if (r !== void 0) {
    var n = r.call(e, t);
    if (ae(n) != "object") return n;
    throw new TypeError("@@toPrimitive must return a primitive value.")
  }
  return (t === "string" ? String : Number)(e)
}
var ee = (function(e) {
  function t() {
    var r;
    Dt(this, t);
    for (var n = arguments.length, s = new Array(n), i = 0; i < n; i++) s[i] = arguments[i];
    return r = It(this, t, [].concat(s)), G(r, "state", {
      isAnimationFinished: !0
    }), G(r, "id", Re("recharts-area-")), G(r, "handleAnimationEnd", function() {
      var u = r.props.onAnimationEnd;
      r.setState({
        isAnimationFinished: !0
      }), fe(u) && u()
    }), G(r, "handleAnimationStart", function() {
      var u = r.props.onAnimationStart;
      r.setState({
        isAnimationFinished: !1
      }), fe(u) && u()
    }), r
  }
  return Lt(t, e), Rt(t, [{
    key: "renderDots",
    value: function(n, s, i) {
      var u = this.props.isAnimationActive,
        p = this.state.isAnimationFinished;
      if (u && !p) return null;
      var x = this.props,
        f = x.dot,
        l = x.points,
        d = x.dataKey,
        y = U(this.props, !1),
        h = U(f, !0),
        A = l.map(function(S, _) {
          var $ = Z(Z(Z({
            key: "dot-".concat(_),
            r: 3
          }, y), h), {}, {
            index: _,
            cx: S.x,
            cy: S.y,
            dataKey: d,
            value: S.value,
            payload: S.payload,
            points: l
          });
          return t.renderDotItem(f, $)
        }),
        k = {
          clipPath: n ? "url(#clipPath-".concat(s ? "" : "dots-").concat(i, ")") : null
        };
      return P.createElement(q, Q({
        className: "recharts-area-dots"
      }, k), A)
    }
  }, {
    key: "renderHorizontalRect",
    value: function(n) {
      var s = this.props,
        i = s.baseLine,
        u = s.points,
        p = s.strokeWidth,
        x = u[0].x,
        f = u[u.length - 1].x,
        l = n * Math.abs(x - f),
        d = ue(u.map(function(y) {
          return y.y || 0
        }));
      return ne(i) && typeof i == "number" ? d = Math.max(i, d) : i && Array.isArray(
        i) && i.length && (d = Math.max(ue(i.map(function(y) {
          return y.y || 0
        })), d)), ne(d) ? P.createElement("rect", {
          x: x < f ? x : x - l,
          y: 0,
          width: l,
          height: Math.floor(d + (p ? parseInt("".concat(p), 10) : 1))
        }) : null
    }
  }, {
    key: "renderVerticalRect",
    value: function(n) {
      var s = this.props,
        i = s.baseLine,
        u = s.points,
        p = s.strokeWidth,
        x = u[0].y,
        f = u[u.length - 1].y,
        l = n * Math.abs(x - f),
        d = ue(u.map(function(y) {
          return y.x || 0
        }));
      return ne(i) && typeof i == "number" ? d = Math.max(i, d) : i && Array.isArray(
        i) && i.length && (d = Math.max(ue(i.map(function(y) {
          return y.x || 0
        })), d)), ne(d) ? P.createElement("rect", {
          x: 0,
          y: x < f ? x : x - l,
          width: d + (p ? parseInt("".concat(p), 10) : 1),
          height: Math.floor(l)
        }) : null
    }
  }, {
    key: "renderClipRect",
    value: function(n) {
      var s = this.props.layout;
      return s === "vertical" ? this.renderVerticalRect(n) : this.renderHorizontalRect(
        n)
    }
  }, {
    key: "renderAreaStatically",
    value: function(n, s, i, u) {
      var p = this.props,
        x = p.layout,
        f = p.type,
        l = p.stroke,
        d = p.connectNulls,
        y = p.isRange;
      p.ref;
      var h = He(p, Mt);
      return P.createElement(q, {
        clipPath: i ? "url(#clipPath-".concat(u, ")") : null
      }, P.createElement(de, Q({}, U(h, !0), {
        points: n,
        connectNulls: d,
        type: f,
        baseLine: s,
        layout: x,
        stroke: "none",
        className: "recharts-area-area"
      })), l !== "none" && P.createElement(de, Q({}, U(this.props, !1), {
        className: "recharts-area-curve",
        layout: x,
        type: f,
        connectNulls: d,
        fill: "none",
        points: n
      })), l !== "none" && y && P.createElement(de, Q({}, U(this.props, !1), {
        className: "recharts-area-curve",
        layout: x,
        type: f,
        connectNulls: d,
        fill: "none",
        points: s
      })))
    }
  }, {
    key: "renderAreaWithAnimation",
    value: function(n, s) {
      var i = this,
        u = this.props,
        p = u.points,
        x = u.baseLine,
        f = u.isAnimationActive,
        l = u.animationBegin,
        d = u.animationDuration,
        y = u.animationEasing,
        h = u.animationId,
        A = this.state,
        k = A.prevPoints,
        S = A.prevBaseLine;
      return P.createElement(Te, {
        begin: l,
        duration: d,
        isActive: f,
        easing: y,
        from: {
          t: 0
        },
        to: {
          t: 1
        },
        key: "area-".concat(h),
        onAnimationEnd: this.handleAnimationEnd,
        onAnimationStart: this.handleAnimationStart
      }, function(_) {
        var $ = _.t;
        if (k) {
          var O = k.length / p.length,
            c = p.map(function(B, j) {
              var F = Math.floor(j * O);
              if (k[F]) {
                var T = k[F],
                  C = W(T.x, B.x),
                  M = W(T.y, B.y);
                return Z(Z({}, B), {}, {
                  x: C($),
                  y: M($)
                })
              }
              return B
            }),
            b;
          if (ne(x) && typeof x == "number") {
            var w = W(S, x);
            b = w($)
          } else if (J(x) || et(x)) {
            var g = W(S, 0);
            b = g($)
          } else b = x.map(function(B, j) {
            var F = Math.floor(j * O);
            if (S[F]) {
              var T = S[F],
                C = W(T.x, B.x),
                M = W(T.y, B.y);
              return Z(Z({}, B), {}, {
                x: C($),
                y: M($)
              })
            }
            return B
          });
          return i.renderAreaStatically(c, b, n, s)
        }
        return P.createElement(q, null, P.createElement("defs", null, P
          .createElement("clipPath", {
            id: "animationClipPath-".concat(s)
          }, i.renderClipRect($))), P.createElement(q, {
          clipPath: "url(#animationClipPath-".concat(s, ")")
        }, i.renderAreaStatically(p, x, n, s)))
      })
    }
  }, {
    key: "renderArea",
    value: function(n, s) {
      var i = this.props,
        u = i.points,
        p = i.baseLine,
        x = i.isAnimationActive,
        f = this.state,
        l = f.prevPoints,
        d = f.prevBaseLine,
        y = f.totalLength;
      return x && u && u.length && (!l && y > 0 || !ge(l, u) || !ge(d, p)) ? this
        .renderAreaWithAnimation(n, s) : this.renderAreaStatically(u, p, n, s)
    }
  }, {
    key: "render",
    value: function() {
      var n, s = this.props,
        i = s.hide,
        u = s.dot,
        p = s.points,
        x = s.className,
        f = s.top,
        l = s.left,
        d = s.xAxis,
        y = s.yAxis,
        h = s.width,
        A = s.height,
        k = s.isAnimationActive,
        S = s.id;
      if (i || !p || !p.length) return null;
      var _ = this.state.isAnimationFinished,
        $ = p.length === 1,
        O = Se("recharts-area", x),
        c = d && d.allowDataOverflow,
        b = y && y.allowDataOverflow,
        w = c || b,
        g = J(S) ? this.id : S,
        B = (n = U(u, !1)) !== null && n !== void 0 ? n : {
          r: 3,
          strokeWidth: 2
        },
        j = B.r,
        F = j === void 0 ? 3 : j,
        T = B.strokeWidth,
        C = T === void 0 ? 2 : T,
        M = tt(u) ? u : {},
        I = M.clipDot,
        K = I === void 0 ? !0 : I,
        L = F * 2 + C;
      return P.createElement(q, {
        className: O
      }, c || b ? P.createElement("defs", null, P.createElement("clipPath", {
        id: "clipPath-".concat(g)
      }, P.createElement("rect", {
        x: c ? l : l - h / 2,
        y: b ? f : f - A / 2,
        width: c ? h : h * 2,
        height: b ? A : A * 2
      })), !K && P.createElement("clipPath", {
        id: "clipPath-dots-".concat(g)
      }, P.createElement("rect", {
        x: l - L / 2,
        y: f - L / 2,
        width: h + L,
        height: A + L
      }))) : null, $ ? null : this.renderArea(w, g), (u || $) && this.renderDots(w,
        K, g), (!k || _) && Fe.renderCallByParent(this.props, p))
    }
  }], [{
    key: "getDerivedStateFromProps",
    value: function(n, s) {
      return n.animationId !== s.prevAnimationId ? {
        prevAnimationId: n.animationId,
        curPoints: n.points,
        curBaseLine: n.baseLine,
        prevPoints: s.curPoints,
        prevBaseLine: s.curBaseLine
      } : n.points !== s.curPoints || n.baseLine !== s.curBaseLine ? {
        curPoints: n.points,
        curBaseLine: n.baseLine
      } : null
    }
  }])
})(R.PureComponent);
Le = ee;
G(ee, "displayName", "Area");
G(ee, "defaultProps", {
  stroke: "#3182bd",
  fill: "#3182bd",
  fillOpacity: .6,
  xAxisId: 0,
  yAxisId: 0,
  legendType: "line",
  connectNulls: !1,
  points: [],
  dot: !1,
  activeDot: !0,
  hide: !1,
  isAnimationActive: !De.isSsr,
  animationBegin: 0,
  animationDuration: 1500,
  animationEasing: "ease"
});
G(ee, "getBaseValue", function(e, t, r, n) {
  var s = e.layout,
    i = e.baseValue,
    u = t.props.baseValue,
    p = u ?? i;
  if (ne(p) && typeof p == "number") return p;
  var x = s === "horizontal" ? n : r,
    f = x.scale.domain();
  if (x.type === "number") {
    var l = Math.max(f[0], f[1]),
      d = Math.min(f[0], f[1]);
    return p === "dataMin" ? d : p === "dataMax" || l < 0 ? l : Math.max(Math.min(f[0], f[1]),
      0)
  }
  return p === "dataMin" ? f[0] : p === "dataMax" ? f[1] : f[0]
});
G(ee, "getComposedData", function(e) {
  var t = e.props,
    r = e.item,
    n = e.xAxis,
    s = e.yAxis,
    i = e.xAxisTicks,
    u = e.yAxisTicks,
    p = e.bandSize,
    x = e.dataKey,
    f = e.stackedData,
    l = e.dataStartIndex,
    d = e.displayedData,
    y = e.offset,
    h = t.layout,
    A = f && f.length,
    k = Le.getBaseValue(t, r, n, s),
    S = h === "horizontal",
    _ = !1,
    $ = d.map(function(c, b) {
      var w;
      A ? w = f[l + b] : (w = re(c, x), Array.isArray(w) ? _ = !0 : w = [k, w]);
      var g = w[1] == null || A && re(c, x) == null;
      return S ? {
        x: me({
          axis: n,
          ticks: i,
          bandSize: p,
          entry: c,
          index: b
        }),
        y: g ? null : s.scale(w[1]),
        value: w,
        payload: c
      } : {
        x: g ? null : n.scale(w[1]),
        y: me({
          axis: s,
          ticks: u,
          bandSize: p,
          entry: c,
          index: b
        }),
        value: w,
        payload: c
      }
    }),
    O;
  return A || _ ? O = $.map(function(c) {
    var b = Array.isArray(c.value) ? c.value[0] : null;
    return S ? {
      x: c.x,
      y: b != null && c.y != null ? s.scale(b) : null
    } : {
      x: b != null ? n.scale(b) : null,
      y: c.y
    }
  }) : O = S ? s.scale(k) : n.scale(k), Z({
    points: $,
    baseLine: O,
    layout: h,
    isRange: _
  }, y)
});
G(ee, "renderDotItem", function(e, t) {
  var r;
  if (P.isValidElement(e)) r = P.cloneElement(e, t);
  else if (fe(e)) r = e(t);
  else {
    var n = Se("recharts-area-dot", typeof e != "boolean" ? e.className : ""),
      s = t.key,
      i = He(t, Tt);
    r = P.createElement(nt, Q({}, i, {
      key: s,
      className: n
    }))
  }
  return r
});

function se(e) {
  "@babel/helpers - typeof";
  return se = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(t) {
    return typeof t
  } : function(t) {
    return t && typeof Symbol == "function" && t.constructor === Symbol && t !== Symbol
      .prototype ? "symbol" : typeof t
  }, se(e)
}

function Vt(e, t) {
  if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function")
}

function Wt(e, t) {
  for (var r = 0; r < t.length; r++) {
    var n = t[r];
    n.enumerable = n.enumerable || !1, n.configurable = !0, "value" in n && (n.writable = !0),
      Object.defineProperty(e, Ue(n.key), n)
  }
}

function qt(e, t, r) {
  return t && Wt(e.prototype, t), Object.defineProperty(e, "prototype", {
    writable: !1
  }), e
}

function Gt(e, t, r) {
  return t = xe(t), Ut(e, qe() ? Reflect.construct(t, r || [], xe(e).constructor) : t.apply(e, r))
}

function Ut(e, t) {
  if (t && (se(t) === "object" || typeof t == "function")) return t;
  if (t !== void 0) throw new TypeError("Derived constructors may only return object or undefined");
  return Zt(e)
}

function Zt(e) {
  if (e === void 0) throw new ReferenceError(
    "this hasn't been initialised - super() hasn't been called");
  return e
}

function qe() {
  try {
    var e = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}))
  } catch {}
  return (qe = function() {
    return !!e
  })()
}

function xe(e) {
  return xe = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function(r) {
    return r.__proto__ || Object.getPrototypeOf(r)
  }, xe(e)
}

function Jt(e, t) {
  if (typeof t != "function" && t !== null) throw new TypeError(
    "Super expression must either be null or a function");
  e.prototype = Object.create(t && t.prototype, {
    constructor: {
      value: e,
      writable: !0,
      configurable: !0
    }
  }), Object.defineProperty(e, "prototype", {
    writable: !1
  }), t && Ae(e, t)
}

function Ae(e, t) {
  return Ae = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function(n, s) {
    return n.__proto__ = s, n
  }, Ae(e, t)
}

function Ge(e, t, r) {
  return t = Ue(t), t in e ? Object.defineProperty(e, t, {
    value: r,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : e[t] = r, e
}

function Ue(e) {
  var t = Xt(e, "string");
  return se(t) == "symbol" ? t : t + ""
}

function Xt(e, t) {
  if (se(e) != "object" || !e) return e;
  var r = e[Symbol.toPrimitive];
  if (r !== void 0) {
    var n = r.call(e, t);
    if (se(n) != "object") return n;
    throw new TypeError("@@toPrimitive must return a primitive value.")
  }
  return (t === "string" ? String : Number)(e)
}
var be = (function(e) {
  function t() {
    return Vt(this, t), Gt(this, t, arguments)
  }
  return Jt(t, e), qt(t, [{
    key: "render",
    value: function() {
      return null
    }
  }])
})(R.Component);
Ge(be, "displayName", "ZAxis");
Ge(be, "defaultProps", {
  zAxisId: 0,
  range: [64, 64],
  scale: "auto",
  type: "number"
});
var Yt = ["option", "isActive"];

function le() {
  return le = Object.assign ? Object.assign.bind() : function(e) {
    for (var t = 1; t < arguments.length; t++) {
      var r = arguments[t];
      for (var n in r) Object.prototype.hasOwnProperty.call(r, n) && (e[n] = r[n])
    }
    return e
  }, le.apply(this, arguments)
}

function Qt(e, t) {
  if (e == null) return {};
  var r = en(e, t),
    n, s;
  if (Object.getOwnPropertySymbols) {
    var i = Object.getOwnPropertySymbols(e);
    for (s = 0; s < i.length; s++) n = i[s], !(t.indexOf(n) >= 0) && Object.prototype
      .propertyIsEnumerable.call(e, n) && (r[n] = e[n])
  }
  return r
}

function en(e, t) {
  if (e == null) return {};
  var r = {};
  for (var n in e)
    if (Object.prototype.hasOwnProperty.call(e, n)) {
      if (t.indexOf(n) >= 0) continue;
      r[n] = e[n]
    } return r
}

function tn(e) {
  var t = e.option,
    r = e.isActive,
    n = Qt(e, Yt);
  return typeof t == "string" ? R.createElement(_e, le({
    option: R.createElement(rt, le({
      type: t
    }, n)),
    isActive: r,
    shapeType: "symbols"
  }, n)) : R.createElement(_e, le({
    option: t,
    isActive: r,
    shapeType: "symbols"
  }, n))
}

function ie(e) {
  "@babel/helpers - typeof";
  return ie = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(t) {
    return typeof t
  } : function(t) {
    return t && typeof Symbol == "function" && t.constructor === Symbol && t !== Symbol
      .prototype ? "symbol" : typeof t
  }, ie(e)
}

function ce() {
  return ce = Object.assign ? Object.assign.bind() : function(e) {
    for (var t = 1; t < arguments.length; t++) {
      var r = arguments[t];
      for (var n in r) Object.prototype.hasOwnProperty.call(r, n) && (e[n] = r[n])
    }
    return e
  }, ce.apply(this, arguments)
}

function Be(e, t) {
  var r = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var n = Object.getOwnPropertySymbols(e);
    t && (n = n.filter(function(s) {
      return Object.getOwnPropertyDescriptor(e, s).enumerable
    })), r.push.apply(r, n)
  }
  return r
}

function H(e) {
  for (var t = 1; t < arguments.length; t++) {
    var r = arguments[t] != null ? arguments[t] : {};
    t % 2 ? Be(Object(r), !0).forEach(function(n) {
      X(e, n, r[n])
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object
      .getOwnPropertyDescriptors(r)) : Be(Object(r)).forEach(function(n) {
      Object.defineProperty(e, n, Object.getOwnPropertyDescriptor(r, n))
    })
  }
  return e
}

function nn(e, t) {
  if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function")
}

function Ce(e, t) {
  for (var r = 0; r < t.length; r++) {
    var n = t[r];
    n.enumerable = n.enumerable || !1, n.configurable = !0, "value" in n && (n.writable = !0),
      Object.defineProperty(e, Je(n.key), n)
  }
}

function rn(e, t, r) {
  return t && Ce(e.prototype, t), r && Ce(e, r), Object.defineProperty(e, "prototype", {
    writable: !1
  }), e
}

function an(e, t, r) {
  return t = ye(t), sn(e, Ze() ? Reflect.construct(t, r || [], ye(e).constructor) : t.apply(e, r))
}

function sn(e, t) {
  if (t && (ie(t) === "object" || typeof t == "function")) return t;
  if (t !== void 0) throw new TypeError("Derived constructors may only return object or undefined");
  return on(e)
}

function on(e) {
  if (e === void 0) throw new ReferenceError(
    "this hasn't been initialised - super() hasn't been called");
  return e
}

function Ze() {
  try {
    var e = !Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function() {}))
  } catch {}
  return (Ze = function() {
    return !!e
  })()
}

function ye(e) {
  return ye = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function(r) {
    return r.__proto__ || Object.getPrototypeOf(r)
  }, ye(e)
}

function ln(e, t) {
  if (typeof t != "function" && t !== null) throw new TypeError(
    "Super expression must either be null or a function");
  e.prototype = Object.create(t && t.prototype, {
    constructor: {
      value: e,
      writable: !0,
      configurable: !0
    }
  }), Object.defineProperty(e, "prototype", {
    writable: !1
  }), t && Ne(e, t)
}

function Ne(e, t) {
  return Ne = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function(n, s) {
    return n.__proto__ = s, n
  }, Ne(e, t)
}

function X(e, t, r) {
  return t = Je(t), t in e ? Object.defineProperty(e, t, {
    value: r,
    enumerable: !0,
    configurable: !0,
    writable: !0
  }) : e[t] = r, e
}

function Je(e) {
  var t = cn(e, "string");
  return ie(t) == "symbol" ? t : t + ""
}

function cn(e, t) {
  if (ie(e) != "object" || !e) return e;
  var r = e[Symbol.toPrimitive];
  if (r !== void 0) {
    var n = r.call(e, t);
    if (ie(n) != "object") return n;
    throw new TypeError("@@toPrimitive must return a primitive value.")
  }
  return (t === "string" ? String : Number)(e)
}
var ve = (function(e) {
  function t() {
    var r;
    nn(this, t);
    for (var n = arguments.length, s = new Array(n), i = 0; i < n; i++) s[i] = arguments[i];
    return r = an(this, t, [].concat(s)), X(r, "state", {
      isAnimationFinished: !1
    }), X(r, "handleAnimationEnd", function() {
      r.setState({
        isAnimationFinished: !0
      })
    }), X(r, "handleAnimationStart", function() {
      r.setState({
        isAnimationFinished: !1
      })
    }), X(r, "id", Re("recharts-scatter-")), r
  }
  return ln(t, e), rn(t, [{
    key: "renderSymbolsStatically",
    value: function(n) {
      var s = this,
        i = this.props,
        u = i.shape,
        p = i.activeShape,
        x = i.activeIndex,
        f = U(this.props, !1);
      return n.map(function(l, d) {
        var y = x === d,
          h = y ? p : u,
          A = H(H({}, f), l);
        return P.createElement(q, ce({
          className: "recharts-scatter-symbol",
          key: "symbol-".concat(l?.cx, "-").concat(l?.cy, "-").concat(l?.size,
            "-").concat(d)
        }, at(s.props, l, d), {
          role: "img"
        }), P.createElement(tn, ce({
          option: h,
          isActive: y,
          key: "symbol-".concat(d)
        }, A)))
      })
    }
  }, {
    key: "renderSymbolsWithAnimation",
    value: function() {
      var n = this,
        s = this.props,
        i = s.points,
        u = s.isAnimationActive,
        p = s.animationBegin,
        x = s.animationDuration,
        f = s.animationEasing,
        l = s.animationId,
        d = this.state.prevPoints;
      return P.createElement(Te, {
        begin: p,
        duration: x,
        isActive: u,
        easing: f,
        from: {
          t: 0
        },
        to: {
          t: 1
        },
        key: "pie-".concat(l),
        onAnimationEnd: this.handleAnimationEnd,
        onAnimationStart: this.handleAnimationStart
      }, function(y) {
        var h = y.t,
          A = i.map(function(k, S) {
            var _ = d && d[S];
            if (_) {
              var $ = W(_.cx, k.cx),
                O = W(_.cy, k.cy),
                c = W(_.size, k.size);
              return H(H({}, k), {}, {
                cx: $(h),
                cy: O(h),
                size: c(h)
              })
            }
            var b = W(0, k.size);
            return H(H({}, k), {}, {
              size: b(h)
            })
          });
        return P.createElement(q, null, n.renderSymbolsStatically(A))
      })
    }
  }, {
    key: "renderSymbols",
    value: function() {
      var n = this.props,
        s = n.points,
        i = n.isAnimationActive,
        u = this.state.prevPoints;
      return i && s && s.length && (!u || !ge(u, s)) ? this
      .renderSymbolsWithAnimation() : this.renderSymbolsStatically(s)
    }
  }, {
    key: "renderErrorBar",
    value: function() {
      var n = this.props.isAnimationActive;
      if (n && !this.state.isAnimationFinished) return null;
      var s = this.props,
        i = s.points,
        u = s.xAxis,
        p = s.yAxis,
        x = s.children,
        f = Ie(x, st);
      return f ? f.map(function(l, d) {
        var y = l.props,
          h = y.direction,
          A = y.dataKey;
        return P.cloneElement(l, {
          key: "".concat(h, "-").concat(A, "-").concat(i[d]),
          data: i,
          xAxis: u,
          yAxis: p,
          layout: h === "x" ? "vertical" : "horizontal",
          dataPointFormatter: function(S, _) {
            return {
              x: S.cx,
              y: S.cy,
              value: h === "x" ? +S.node.x : +S.node.y,
              errorVal: re(S, _)
            }
          }
        })
      }) : null
    }
  }, {
    key: "renderLine",
    value: function() {
      var n = this.props,
        s = n.points,
        i = n.line,
        u = n.lineType,
        p = n.lineJointType,
        x = U(this.props, !1),
        f = U(i, !1),
        l, d;
      if (u === "joint") l = s.map(function(O) {
        return {
          x: O.cx,
          y: O.cy
        }
      });
      else if (u === "fitting") {
        var y = it(s),
          h = y.xmin,
          A = y.xmax,
          k = y.a,
          S = y.b,
          _ = function(c) {
            return k * c + S
          };
        l = [{
          x: h,
          y: _(h)
        }, {
          x: A,
          y: _(A)
        }]
      }
      var $ = H(H(H({}, x), {}, {
        fill: "none",
        stroke: x && x.fill
      }, f), {}, {
        points: l
      });
      return P.isValidElement(i) ? d = P.cloneElement(i, $) : fe(i) ? d = i($) : d = P
        .createElement(de, ce({}, $, {
          type: p
        })), P.createElement(q, {
          className: "recharts-scatter-line",
          key: "recharts-scatter-line"
        }, d)
    }
  }, {
    key: "render",
    value: function() {
      var n = this.props,
        s = n.hide,
        i = n.points,
        u = n.line,
        p = n.className,
        x = n.xAxis,
        f = n.yAxis,
        l = n.left,
        d = n.top,
        y = n.width,
        h = n.height,
        A = n.id,
        k = n.isAnimationActive;
      if (s || !i || !i.length) return null;
      var S = this.state.isAnimationFinished,
        _ = Se("recharts-scatter", p),
        $ = x && x.allowDataOverflow,
        O = f && f.allowDataOverflow,
        c = $ || O,
        b = J(A) ? this.id : A;
      return P.createElement(q, {
        className: _,
        clipPath: c ? "url(#clipPath-".concat(b, ")") : null
      }, $ || O ? P.createElement("defs", null, P.createElement("clipPath", {
        id: "clipPath-".concat(b)
      }, P.createElement("rect", {
        x: $ ? l : l - y / 2,
        y: O ? d : d - h / 2,
        width: $ ? y : y * 2,
        height: O ? h : h * 2
      }))) : null, u && this.renderLine(), this.renderErrorBar(), P.createElement(
      q, {
        key: "recharts-scatter-symbols"
      }, this.renderSymbols()), (!k || S) && Fe.renderCallByParent(this.props, i))
    }
  }], [{
    key: "getDerivedStateFromProps",
    value: function(n, s) {
      return n.animationId !== s.prevAnimationId ? {
        prevAnimationId: n.animationId,
        curPoints: n.points,
        prevPoints: s.curPoints
      } : n.points !== s.curPoints ? {
        curPoints: n.points
      } : null
    }
  }])
})(R.PureComponent);
X(ve, "displayName", "Scatter");
X(ve, "defaultProps", {
  xAxisId: 0,
  yAxisId: 0,
  zAxisId: 0,
  legendType: "circle",
  lineType: "joint",
  lineJointType: "linear",
  data: [],
  shape: "circle",
  hide: !1,
  isAnimationActive: !De.isSsr,
  animationBegin: 0,
  animationDuration: 400,
  animationEasing: "linear"
});
X(ve, "getComposedData", function(e) {
  var t = e.xAxis,
    r = e.yAxis,
    n = e.zAxis,
    s = e.item,
    i = e.displayedData,
    u = e.xAxisTicks,
    p = e.yAxisTicks,
    x = e.offset,
    f = s.props.tooltipType,
    l = Ie(s.props.children, ot),
    d = J(t.dataKey) ? s.props.dataKey : t.dataKey,
    y = J(r.dataKey) ? s.props.dataKey : r.dataKey,
    h = n && n.dataKey,
    A = n ? n.range : be.defaultProps.range,
    k = A && A[0],
    S = t.scale.bandwidth ? t.scale.bandwidth() : 0,
    _ = r.scale.bandwidth ? r.scale.bandwidth() : 0,
    $ = i.map(function(O, c) {
      var b = re(O, d),
        w = re(O, y),
        g = !J(h) && re(O, h) || "-",
        B = [{
          name: J(t.dataKey) ? s.props.name : t.name || t.dataKey,
          unit: t.unit || "",
          value: b,
          payload: O,
          dataKey: d,
          type: f
        }, {
          name: J(r.dataKey) ? s.props.name : r.name || r.dataKey,
          unit: r.unit || "",
          value: w,
          payload: O,
          dataKey: y,
          type: f
        }];
      g !== "-" && B.push({
        name: n.name || n.dataKey,
        unit: n.unit || "",
        value: g,
        payload: O,
        dataKey: h,
        type: f
      });
      var j = me({
          axis: t,
          ticks: u,
          bandSize: S,
          entry: O,
          index: c,
          dataKey: d
        }),
        F = me({
          axis: r,
          ticks: p,
          bandSize: _,
          entry: O,
          index: c,
          dataKey: y
        }),
        T = g !== "-" ? n.scale(g) : k,
        C = Math.sqrt(Math.max(T, 0) / Math.PI);
      return H(H({}, O), {}, {
        cx: j,
        cy: F,
        x: j - C,
        y: F - C,
        xAxis: t,
        yAxis: r,
        zAxis: n,
        width: 2 * C,
        height: 2 * C,
        size: T,
        node: {
          x: b,
          y: w,
          z: g
        },
        tooltipPayload: B,
        tooltipPosition: {
          x: j,
          y: F
        },
        payload: O
      }, l && l[c] && l[c].props)
    });
  return H({
    points: $
  }, x)
});
var un = lt({
  chartName: "ComposedChart",
  GraphicalChild: [je, ee, pe, ve],
  axisComponents: [{
    axisType: "xAxis",
    AxisComp: ze
  }, {
    axisType: "yAxis",
    AxisComp: we
  }, {
    axisType: "zAxis",
    AxisComp: be
  }],
  formatAxisMap: ct
});

function dn({
  ticker: e
}) {
  const [t, r] = R.useState("pct"), {
    data: n,
    isLoading: s
  } = Ke({
    queryKey: ["ratings-chart", e],
    queryFn: async () => {
      const [l, d, y, h, A] = await Promise.all([oe(e, "Buy Ratings"), oe(e, "Hold Ratings"),
        oe(e, "Sell Ratings"), oe(e, "Bull%"), oe(e, "Bear%")
      ]);
      return {
        buy: l,
        hold: d,
        sell: y,
        bull: h,
        bear: A
      }
    },
    staleTime: 5 * 6e4
  }), i = R.useMemo(() => {
    if (!n) return [];
    const l = new Map(n.buy.map(c => [c.time, c.value])),
      d = new Map(n.hold.map(c => [c.time, c.value])),
      y = new Map(n.sell.map(c => [c.time, c.value])),
      h = new Map(n.bull.map(c => [c.time, c.value])),
      A = new Map(n.bear.map(c => [c.time, c.value])),
      S = [...new Set([...n.buy.map(c => c.time), ...n.hold.map(c => c.time), ...n.sell.map(c =>
        c.time)])].sort(),
      _ = new Map;
    for (const c of S) {
      const b = l.get(c) ?? 0,
        w = d.get(c) ?? 0,
        g = y.get(c) ?? 0;
      if (b + w + g <= 0) continue;
      const [j, F] = c.split("-").map(Number), T = Math.ceil(F / 3), C = `${j}-Q${T}`;
      _.has(C) || _.set(C, {
        buys: [],
        holds: [],
        sells: [],
        bulls: [],
        bears: []
      });
      const M = _.get(C);
      M.buys.push(b), M.holds.push(w), M.sells.push(g);
      const I = h.get(c),
        K = A.get(c);
      I != null && M.bulls.push(I), K != null && M.bears.push(K)
    }
    if (_.size <= 12) {
      const c = new Map;
      for (const w of S) {
        const g = l.get(w) ?? 0,
          B = d.get(w) ?? 0,
          j = y.get(w) ?? 0;
        if (g + B + j <= 0) continue;
        const T = w.substring(0, 7);
        c.has(T) || c.set(T, {
          buys: [],
          holds: [],
          sells: [],
          bulls: [],
          bears: []
        });
        const C = c.get(T);
        C.buys.push(g), C.holds.push(B), C.sells.push(j);
        const M = h.get(w),
          I = A.get(w);
        M != null && C.bulls.push(M), I != null && C.bears.push(I)
      }
      const b = [];
      for (const [w, g] of c) {
        const B = g.buys.reduce((L, o) => L + o, 0) / g.buys.length,
          j = g.holds.reduce((L, o) => L + o, 0) / g.holds.length,
          F = g.sells.reduce((L, o) => L + o, 0) / g.sells.length,
          T = B + j + F;
        if (T <= 0) continue;
        const [C, M] = w.split("-"), K =
          `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(M)-1]} ${C.slice(2)}`;
        b.push({
          date: K,
          sortKey: w,
          buy: Math.round(B),
          hold: Math.round(j),
          sell: Math.round(F),
          buyPct: B / T * 100,
          holdPct: j / T * 100,
          sellPct: F / T * 100,
          bull: g.bulls.length > 0 ? g.bulls.reduce((L, o) => L + o, 0) / g.bulls.length *
            100 : null,
          bear: g.bears.length > 0 ? g.bears.reduce((L, o) => L + o, 0) / g.bears.length *
            100 : null,
          total: Math.round(T)
        })
      }
      return b.sort((w, g) => w.sortKey.localeCompare(g.sortKey))
    }
    const O = [];
    for (const [c, b] of _) {
      const w = b.buys.reduce((M, I) => M + I, 0) / b.buys.length,
        g = b.holds.reduce((M, I) => M + I, 0) / b.holds.length,
        B = b.sells.reduce((M, I) => M + I, 0) / b.sells.length,
        j = w + g + B;
      if (j <= 0) continue;
      const [F, T] = c.split("-"), C = `${T} '${F.slice(2)}`;
      O.push({
        date: C,
        sortKey: c,
        buy: Math.round(w),
        hold: Math.round(g),
        sell: Math.round(B),
        buyPct: w / j * 100,
        holdPct: g / j * 100,
        sellPct: B / j * 100,
        bull: b.bulls.length > 0 ? b.bulls.reduce((M, I) => M + I, 0) / b.bulls.length *
          100 : null,
        bear: b.bears.length > 0 ? b.bears.reduce((M, I) => M + I, 0) / b.bears.length *
          100 : null,
        total: Math.round(j)
      })
    }
    return O.sort((c, b) => c.sortKey.localeCompare(b.sortKey))
  }, [n]), u = R.useMemo(() => i.some(l => l.bull != null || l.bear != null), [i]);
  if (s) return a.jsxs("div", {
    className: "flex items-center justify-center h-[200px] text-muted-foreground text-xs",
    children: [a.jsx(ut, {
      className: "w-4 h-4 animate-spin mr-2"
    }), "Loading historical ratings for ", e, "..."]
  });
  if (!n || i.length === 0) return a.jsxs("div", {
    className: "flex items-center justify-center h-[60px] text-muted-foreground text-xs",
    children: ["No historical ratings data for ", e]
  });
  const p = t === "pct",
    x = ({
      active: l,
      payload: d,
      label: y
    }) => {
      if (!l || !d?.length) return null;
      const h = d[0]?.payload;
      return h ? a.jsxs("div", {
        className: "bg-card border border-border rounded px-3 py-2 shadow-lg text-xs",
        children: [a.jsx("div", {
          className: "font-semibold text-foreground mb-1.5",
          children: y
        }), a.jsxs("div", {
          className: "space-y-0.5",
          children: [a.jsxs("div", {
            className: "flex items-center gap-2",
            children: [a.jsx("span", {
              className: "w-2 h-2 rounded-sm bg-emerald-500 inline-block"
            }), a.jsx("span", {
              className: "text-muted-foreground",
              children: "Buy:"
            }), a.jsx("span", {
              className: "font-mono text-emerald-400",
              children: p ? `${h.buyPct.toFixed(1)}%` : h.buy
            })]
          }), a.jsxs("div", {
            className: "flex items-center gap-2",
            children: [a.jsx("span", {
              className: "w-2 h-2 rounded-sm bg-zinc-500 inline-block"
            }), a.jsx("span", {
              className: "text-muted-foreground",
              children: "Hold:"
            }), a.jsx("span", {
              className: "font-mono text-zinc-300",
              children: p ? `${h.holdPct.toFixed(1)}%` : h.hold
            })]
          }), a.jsxs("div", {
            className: "flex items-center gap-2",
            children: [a.jsx("span", {
              className: "w-2 h-2 rounded-sm bg-red-500 inline-block"
            }), a.jsx("span", {
              className: "text-muted-foreground",
              children: "Sell:"
            }), a.jsx("span", {
              className: "font-mono text-red-400",
              children: p ? `${h.sellPct.toFixed(1)}%` : h.sell
            })]
          }), a.jsxs("div", {
            className: "flex items-center gap-2 text-muted-foreground",
            children: [a.jsx("span", {
              className: "w-2 h-2 inline-block"
            }), a.jsx("span", {
              children: "Total:"
            }), a.jsx("span", {
              className: "font-mono",
              children: h.total
            })]
          }), h.bull != null && a.jsxs("div", {
            className: "flex items-center gap-2 mt-1 pt-1 border-t border-border/50",
            children: [a.jsx("span", {
              className: "w-2 h-0.5 bg-green-400 inline-block"
            }), a.jsx("span", {
              className: "text-muted-foreground",
              children: "Bull%:"
            }), a.jsxs("span", {
              className: "font-mono text-green-400",
              children: [h.bull.toFixed(1), "%"]
            })]
          }), h.bear != null && a.jsxs("div", {
            className: "flex items-center gap-2",
            children: [a.jsx("span", {
              className: "w-2 h-0.5 bg-red-400 inline-block"
            }), a.jsx("span", {
              className: "text-muted-foreground",
              children: "Bear%:"
            }), a.jsxs("span", {
              className: "font-mono text-red-400",
              children: [h.bear.toFixed(1), "%"]
            })]
          })]
        })]
      }) : null
    },
    f = i.length > 40 ? 3 : i.length > 20 ? 1 : 0;
  return a.jsxs("div", {
    className: "px-4 py-2 bg-muted/20",
    children: [a.jsxs("div", {
      className: "flex items-center gap-2 mb-2",
      children: [a.jsxs("span", {
        className: "text-[11px] font-semibold text-foreground",
        children: [e, " — Ratings Over Time"]
      }), a.jsx("div", {
        className: "flex gap-px ml-2",
        children: ["pct", "counts"].map(l => a.jsx("button", {
          className: `text-[9px] font-mono font-bold px-1.5 py-0.5 rounded transition-colors ${t===l?"bg-primary text-primary-foreground":"bg-background/80 text-muted-foreground/60 hover:text-muted-foreground"}`,
          onClick: d => {
            d.stopPropagation(), r(l)
          },
          "data-testid": `ratings-chart-toggle-${l}`,
          children: l === "pct" ? "%" : "#"
        }, l))
      }), a.jsxs("div", {
        className: "flex items-center gap-3 ml-auto text-[9px] text-muted-foreground",
        children: [a.jsxs("span", {
          className: "flex items-center gap-1",
          children: [a.jsx("span", {
            className: "w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"
          }), "Buy"]
        }), a.jsxs("span", {
          className: "flex items-center gap-1",
          children: [a.jsx("span", {
            className: "w-2.5 h-2.5 rounded-sm bg-zinc-500 inline-block"
          }), "Hold"]
        }), a.jsxs("span", {
          className: "flex items-center gap-1",
          children: [a.jsx("span", {
            className: "w-2.5 h-2.5 rounded-sm bg-red-500 inline-block"
          }), "Sell"]
        }), u && a.jsxs(a.Fragment, {
          children: [a.jsx("span", {
            className: "h-3 w-px bg-border"
          }), a.jsxs("span", {
            className: "flex items-center gap-1",
            children: [a.jsx("span", {
              className: "w-3 h-px bg-green-400 inline-block",
              style: {
                borderTop: "2px dashed"
              }
            }), "Bull%"]
          }), a.jsxs("span", {
            className: "flex items-center gap-1",
            children: [a.jsx("span", {
              className: "w-3 h-px bg-red-400 inline-block",
              style: {
                borderTop: "2px dashed"
              }
            }), "Bear%"]
          })]
        })]
      })]
    }), a.jsx(dt, {
      width: "100%",
      height: 220,
      children: a.jsxs(un, {
        data: i,
        margin: {
          top: 4,
          right: u ? 40 : 8,
          bottom: 0,
          left: 0
        },
        barCategoryGap: "8%",
        children: [a.jsx(_t, {
          strokeDasharray: "3 3",
          stroke: "rgba(255,255,255,0.05)",
          vertical: !1
        }), a.jsx(ze, {
          dataKey: "date",
          tick: {
            fontSize: 9,
            fill: "rgba(255,255,255,0.4)"
          },
          tickLine: !1,
          axisLine: {
            stroke: "rgba(255,255,255,0.08)"
          },
          interval: f,
          angle: i.length > 30 ? -45 : 0,
          textAnchor: i.length > 30 ? "end" : "middle",
          height: i.length > 30 ? 40 : 24
        }), a.jsx(we, {
          yAxisId: "left",
          tick: {
            fontSize: 9,
            fill: "rgba(255,255,255,0.4)"
          },
          tickLine: !1,
          axisLine: !1,
          domain: p ? [0, 100] : ["auto", "auto"],
          tickFormatter: l => p ? `${l}%` : `${l}`,
          width: 36
        }), u && a.jsx(we, {
          yAxisId: "right",
          orientation: "right",
          tick: {
            fontSize: 9,
            fill: "rgba(255,255,255,0.3)"
          },
          tickLine: !1,
          axisLine: !1,
          domain: [0, 100],
          tickFormatter: l => `${l}%`,
          width: 36
        }), a.jsx(pt, {
          content: a.jsx(x, {}),
          cursor: {
            fill: "rgba(255,255,255,0.04)"
          }
        }), a.jsx(pe, {
          yAxisId: "left",
          dataKey: p ? "buyPct" : "buy",
          stackId: "ratings",
          fill: "#10b981",
          radius: [0, 0, 0, 0],
          isAnimationActive: !1
        }), a.jsx(pe, {
          yAxisId: "left",
          dataKey: p ? "holdPct" : "hold",
          stackId: "ratings",
          fill: "#71717a",
          radius: [0, 0, 0, 0],
          isAnimationActive: !1
        }), a.jsx(pe, {
          yAxisId: "left",
          dataKey: p ? "sellPct" : "sell",
          stackId: "ratings",
          fill: "#ef4444",
          radius: [2, 2, 0, 0],
          isAnimationActive: !1
        }), u && a.jsxs(a.Fragment, {
          children: [a.jsx(je, {
            yAxisId: "right",
            type: "monotone",
            dataKey: "bull",
            stroke: "#4ade80",
            strokeWidth: 1.5,
            strokeDasharray: "4 3",
            dot: !1,
            connectNulls: !0,
            isAnimationActive: !1
          }), a.jsx(je, {
            yAxisId: "right",
            type: "monotone",
            dataKey: "bear",
            stroke: "#f87171",
            strokeWidth: 1.5,
            strokeDasharray: "4 3",
            dot: !1,
            connectNulls: !0,
            isAnimationActive: !1
          })]
        })]
      })
    })]
  })
}

function pn(e) {
  return e >= 70 ? "bg-emerald-600/70 text-white" : e >= 50 ? "bg-emerald-600/40 text-emerald-200" :
    e >= 30 ? "bg-yellow-600/40 text-yellow-200" : "bg-red-600/40 text-red-200"
}

function mn(e) {
  return e >= 20 ? "bg-red-600/70 text-white" : e >= 10 ? "bg-red-600/40 text-red-200" : e >= 5 ?
    "bg-yellow-600/30 text-yellow-200" : "bg-emerald-600/30 text-emerald-200"
}

function te(e, t, r, n) {
  return e <= 0 ? null : a.jsx("div", {
    className: `${t} flex items-center justify-center text-[10px] font-semibold ${n} transition-all`,
    style: {
      width: `${e}%`,
      minWidth: e > 5 ? "20px" : "0px"
    },
    title: `${r}: ${e.toFixed(1)}%`,
    children: e >= 8 ? `${Math.round(e)}%` : ""
  })
}

function bn() {
  const {
    activeTickers: e
  } = mt(), [t, r] = R.useState("subsector"), [n, s] = R.useState("buyPct"), [i, u] = R.useState(
    "desc"), [p, x] = R.useState(ft()), [f, l] = R.useState(""), [d, y] = R.useState(new Set), [h,
    A
  ] = R.useState(new Set), [k, S] = R.useState(null), _ = R.useCallback(() => ({
    groupBy: t,
    sortKey: n,
    sortDir: i,
    classFilters: ht(p),
    search: f,
    manualTickers: [...d],
    collapsed: [...h]
  }), [t, n, i, p, f, d, h]), $ = R.useCallback(o => {
    o.groupBy !== void 0 && r(o.groupBy), o.sortKey !== void 0 && s(o.sortKey), o.sortDir !==
      void 0 && u(o.sortDir), o.classFilters !== void 0 && x(xt(o.classFilters)), o.search !==
      void 0 && l(o.search), o.manualTickers !== void 0 && y(new Set(o.manualTickers)), o
      .collapsed !== void 0 && A(new Set(o.collapsed))
  }, []);
  yt("ratings", _, $);
  const O = o => {
      r(o)
    },
    c = o => {
      o === n ? u(i === "asc" ? "desc" : "asc") : (s(o), u(o === "ticker" || o === "name" ? "asc" :
        "desc"))
    },
    b = o => {
      x(o)
    },
    w = ["Buy Ratings", "Hold Ratings", "Sell Ratings", "Bull%", "Bear%"],
    {
      data: g,
      isLoading: B
    } = Ke({
      queryKey: ["ratings-data"],
      queryFn: () => kt(w),
      staleTime: 5 * 6e4
    }),
    j = R.useMemo(() => {
      if (!g) return [];
      const o = e ? new Set(e) : null,
        m = g.filter(E => !o || o.has(E.ticker));
      return bt(m, p, f, d).map(E => {
        const z = E.values["Buy Ratings"],
          v = E.values["Hold Ratings"],
          D = E.values["Sell Ratings"],
          V = (z ?? 0) + (v ?? 0) + (D ?? 0),
          Xe = V > 0 && z != null ? z / V * 100 : null,
          Ye = V > 0 && v != null ? v / V * 100 : null,
          Qe = V > 0 && D != null ? D / V * 100 : null,
          Oe = E.values["Bull%"],
          ke = E.values["Bear%"];
        return {
          ticker: E.ticker,
          name: E.name,
          economy: E.economy,
          sector: E.sector,
          subsector: E.subsector,
          industryGroup: E.industryGroup,
          industry: E.industry,
          subindustry: E.subindustry,
          buyCount: z,
          holdCount: v,
          sellCount: D,
          totalCount: V,
          buyPct: Xe,
          holdPct: Ye,
          sellPct: Qe,
          bullPct: Oe != null ? Oe * 100 : null,
          bearPct: ke != null ? ke * 100 : null
        }
      }).filter(E => E.totalCount > 0)
    }, [g, e, p, f, d]),
    F = R.useMemo(() => {
      const o = [...j],
        m = i === "asc" ? 1 : -1;
      return o.sort((N, E) => {
        if (n === "ticker") return m * N.ticker.localeCompare(E.ticker);
        if (n === "name") return m * N.name.localeCompare(E.name);
        if (n === "group") {
          const D = t !== "none" && N[t] || "",
            V = t !== "none" && E[t] || "";
          return D !== V ? m * D.localeCompare(V) : (E.buyPct ?? 0) - (N.buyPct ?? 0)
        }
        const z = N[n] ?? -1 / 0,
          v = E[n] ?? -1 / 0;
        return m * (z - v)
      }), o
    }, [j, n, i, t]),
    T = R.useMemo(() => {
      if (t === "none") return [{
        label: "",
        rows: F
      }];
      const o = new Map;
      for (const m of F) {
        const N = m[t] || "Other";
        o.has(N) || o.set(N, []), o.get(N).push(m)
      }
      return [...o.entries()].sort(([, m], [, N]) => {
        const E = m.reduce((v, D) => v + (D.buyPct ?? 0), 0) / m.length;
        return N.reduce((v, D) => v + (D.buyPct ?? 0), 0) / N.length - E
      }).map(([m, N]) => ({
        label: m,
        rows: N
      }))
    }, [F, t]),
    C = R.useMemo(() => {
      if (j.length === 0) return null;
      const o = j.reduce((v, D) => v + (D.buyPct ?? 0), 0) / j.length,
        m = j.reduce((v, D) => v + (D.holdPct ?? 0), 0) / j.length,
        N = j.reduce((v, D) => v + (D.sellPct ?? 0), 0) / j.length,
        E = j.reduce((v, D) => (D.buyPct ?? 0) > (v.buyPct ?? 0) ? D : v, j[0]),
        z = j.reduce((v, D) => (D.sellPct ?? 0) > (v.sellPct ?? 0) ? D : v, j[0]);
      return {
        avgBuy: o,
        avgHold: m,
        avgSell: N,
        highestBuy: E,
        highestSell: z
      }
    }, [j]),
    M = o => {
      A(m => {
        const N = new Set(m);
        return N.has(o) ? N.delete(o) : N.add(o), N
      })
    },
    I = () => {
      const o = ["Ticker", "Name", "Subsector", "Industry", "Buy", "Hold", "Sell", "Total", "Buy%",
          "Hold%", "Sell%", "Bull%", "Bear%"
        ].join(","),
        m = F.map(v => [v.ticker, `"${v.name}"`, `"${v.subsector}"`, `"${v.industry}"`, v
          .buyCount ?? "", v.holdCount ?? "", v.sellCount ?? "", v.totalCount, v.buyPct != null ?
          v.buyPct.toFixed(1) : "", v.holdPct != null ? v.holdPct.toFixed(1) : "", v.sellPct !=
          null ? v.sellPct.toFixed(1) : "", v.bullPct != null ? v.bullPct.toFixed(1) : "", v
          .bearPct != null ? v.bearPct.toFixed(1) : ""
        ].join(",")),
        N = new Blob([o + `
` + m.join(`
`)], {
          type: "text/csv"
        }),
        E = URL.createObjectURL(N),
        z = document.createElement("a");
      z.href = E, z.download = "ratings_heatmap.csv", z.click(), URL.revokeObjectURL(E)
    },
    K = ({
      label: o,
      field: m,
      className: N
    }) => a.jsx("th", {
      className: `px-2 py-1.5 text-[10px] font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none ${N??""}`,
      onClick: () => c(m),
      children: a.jsxs("span", {
        className: "flex items-center gap-0.5",
        children: [o, n === m ? i === "asc" ? a.jsx(St, {
          className: "w-2.5 h-2.5"
        }) : a.jsx(Ot, {
          className: "w-2.5 h-2.5"
        }) : a.jsx($t, {
          className: "w-2.5 h-2.5 opacity-30"
        })]
      })
    }),
    L = ({
      rows: o
    }) => {
      const m = o.reduce((z, v) => z + (v.buyPct ?? 0), 0) / o.length,
        N = o.reduce((z, v) => z + (v.holdPct ?? 0), 0) / o.length,
        E = o.reduce((z, v) => z + (v.sellPct ?? 0), 0) / o.length;
      return a.jsxs("div", {
        className: "flex h-4 rounded overflow-hidden w-24",
        children: [te(m, "bg-emerald-600", "Buy", "text-white"), te(N, "bg-zinc-500", "Hold",
          "text-white"), te(E, "bg-red-600", "Sell", "text-white")]
      })
    };
  return B ? a.jsx("div", {
    className: "flex items-center justify-center h-full text-muted-foreground text-sm",
    children: "Loading ratings data..."
  }) : j.length === 0 ? a.jsx("div", {
    className: "flex items-center justify-center h-full text-muted-foreground text-sm",
    children: "No ratings data available. Upload a workbook with Buy/Hold/Sell ratings."
  }) : a.jsxs("div", {
    className: "flex flex-col h-full bg-background",
    children: [a.jsxs("div", {
      className: "flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card/50 flex-shrink-0 flex-wrap",
      children: [C && a.jsxs("div", {
        className: "flex items-center gap-3 mr-3",
        children: [a.jsxs("div", {
          className: "flex items-center gap-1",
          children: [a.jsx(Ct, {
            className: "w-3 h-3 text-emerald-400"
          }), a.jsx("span", {
            className: "text-[10px] text-muted-foreground",
            children: "Avg Buy:"
          }), a.jsxs("span", {
            className: "text-xs font-semibold text-emerald-400",
            children: [C.avgBuy.toFixed(1), "%"]
          })]
        }), a.jsxs("div", {
          className: "flex items-center gap-1",
          children: [a.jsx(Et, {
            className: "w-3 h-3 text-zinc-400"
          }), a.jsx("span", {
            className: "text-[10px] text-muted-foreground",
            children: "Hold:"
          }), a.jsxs("span", {
            className: "text-xs font-semibold text-zinc-300",
            children: [C.avgHold.toFixed(1), "%"]
          })]
        }), a.jsxs("div", {
          className: "flex items-center gap-1",
          children: [a.jsx(Bt, {
            className: "w-3 h-3 text-red-400"
          }), a.jsx("span", {
            className: "text-[10px] text-muted-foreground",
            children: "Sell:"
          }), a.jsxs("span", {
            className: "text-xs font-semibold text-red-400",
            children: [C.avgSell.toFixed(1), "%"]
          })]
        }), a.jsx("div", {
          className: "h-4 w-px bg-border"
        }), a.jsxs("span", {
          className: "text-[10px] text-muted-foreground",
          children: [j.length, " tickers"]
        })]
      }), a.jsxs("div", {
        className: "flex items-center gap-1.5",
        children: [a.jsx("span", {
          className: "text-[10px] text-muted-foreground",
          children: "Group:"
        }), a.jsxs(vt, {
          value: t,
          onValueChange: o => O(o),
          children: [a.jsx(gt, {
            className: "h-6 text-[11px] w-[120px] bg-muted border-0",
            children: a.jsx(jt, {})
          }), a.jsxs(wt, {
            children: [a.jsx(Y, {
              value: "none",
              children: "None"
            }), a.jsx(Y, {
              value: "economy",
              children: "Economy"
            }), a.jsx(Y, {
              value: "sector",
              children: "Sector"
            }), a.jsx(Y, {
              value: "subsector",
              children: "Subsector"
            }), a.jsx(Y, {
              value: "industryGroup",
              children: "Industry Group"
            }), a.jsx(Y, {
              value: "industry",
              children: "Industry"
            }), a.jsx(Y, {
              value: "subindustry",
              children: "Sub-Industry"
            })]
          })]
        })]
      }), a.jsx(Pt, {
        filters: p,
        onFiltersChange: b,
        search: f,
        onSearchChange: l,
        manualTickers: d,
        onManualTickersChange: y,
        filteredCount: j.length,
        totalCount: g?.length ?? 0,
        testIdPrefix: "ratings"
      }), a.jsx("div", {
        className: "ml-auto flex items-center gap-1",
        children: a.jsxs("button", {
          onClick: I,
          className: "flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors",
          children: [a.jsx(At, {
            className: "w-3 h-3"
          }), "CSV"]
        })
      })]
    }), a.jsx("div", {
      className: "flex-1 overflow-auto",
      children: a.jsxs("table", {
        className: "w-full text-xs border-collapse",
        children: [a.jsx("thead", {
          className: "sticky top-0 z-10 bg-card border-b border-border",
          children: a.jsxs("tr", {
            children: [a.jsx(K, {
              label: "Ticker",
              field: "ticker",
              className: "text-left w-16"
            }), a.jsx(K, {
              label: "Name",
              field: "name",
              className: "text-left w-36"
            }), t !== "none" && a.jsx(K, {
              label: "Group",
              field: "group",
              className: "text-left w-32"
            }), a.jsx("th", {
              className: "px-2 py-1.5 text-[10px] font-medium text-muted-foreground text-left w-[280px]",
              children: "Rating Distribution"
            }), a.jsx(K, {
              label: "Buy%",
              field: "buyPct",
              className: "text-right w-14"
            }), a.jsx(K, {
              label: "Hold%",
              field: "holdPct",
              className: "text-right w-14"
            }), a.jsx(K, {
              label: "Sell%",
              field: "sellPct",
              className: "text-right w-14"
            }), a.jsx(K, {
              label: "# Analysts",
              field: "totalCount",
              className: "text-right w-16"
            }), a.jsx(K, {
              label: "Bull%",
              field: "bullPct",
              className: "text-right w-14"
            }), a.jsx(K, {
              label: "Bear%",
              field: "bearPct",
              className: "text-right w-14"
            })]
          })
        }), a.jsx("tbody", {
          children: T.map(o => a.jsxs(P.Fragment, {
            children: [o.label && a.jsxs("tr", {
              className: "bg-muted/50 cursor-pointer hover:bg-muted/80 transition-colors",
              onClick: () => M(o.label),
              children: [a.jsx("td", {
                colSpan: t !== "none" ? 4 : 3,
                className: "px-2 py-1 text-[11px] font-semibold text-foreground",
                children: a.jsxs("span", {
                  className: "flex items-center gap-2",
                  children: [a.jsx("span", {
                    className: "text-muted-foreground text-[10px]",
                    children: h.has(o.label) ? "▶" :
                      "▼"
                  }), o.label, a.jsxs("span", {
                    className: "text-[10px] font-normal text-muted-foreground",
                    children: ["(", o.rows.length,
                      ")"
                    ]
                  }), a.jsx(L, {
                    rows: o.rows
                  })]
                })
              }), a.jsx("td", {
                className: "px-2 py-1 text-right text-[10px] text-emerald-400 font-medium",
                children: (o.rows.reduce((m, N) => m + (N
                    .buyPct ?? 0), 0) / o.rows.length)
                  .toFixed(0)
              }), a.jsx("td", {
                className: "px-2 py-1 text-right text-[10px] text-zinc-400 font-medium",
                children: (o.rows.reduce((m, N) => m + (N
                    .holdPct ?? 0), 0) / o.rows.length)
                  .toFixed(0)
              }), a.jsx("td", {
                className: "px-2 py-1 text-right text-[10px] text-red-400 font-medium",
                children: (o.rows.reduce((m, N) => m + (N
                    .sellPct ?? 0), 0) / o.rows.length)
                  .toFixed(0)
              }), a.jsx("td", {
                className: "px-2 py-1 text-right text-[10px] text-muted-foreground",
                children: (o.rows.reduce((m, N) => m + N
                  .totalCount, 0) / o.rows.length).toFixed(
                  0)
              }), a.jsx("td", {
                className: "px-2 py-1 text-right text-[10px] text-muted-foreground"
              }), a.jsx("td", {
                className: "px-2 py-1 text-right text-[10px] text-muted-foreground"
              })]
            }), !h.has(o.label) && o.rows.map(m => a.jsxs(P
            .Fragment, {
              children: [a.jsxs("tr", {
                className: `border-b border-border/20 hover:bg-accent/30 transition-colors cursor-pointer ${k===m.ticker?"bg-accent/40":""}`,
                onClick: () => S(k === m.ticker ? null : m
                  .ticker),
                children: [a.jsx("td", {
                  className: "px-2 py-1 font-mono font-semibold text-foreground",
                  children: a.jsxs("span", {
                    className: "flex items-center gap-1",
                    children: [k === m.ticker ? a
                      .jsx(Nt, {
                        className: "w-3 h-3 text-primary flex-shrink-0"
                      }) : null, m.ticker
                    ]
                  })
                }), a.jsx("td", {
                  className: "px-2 py-1 text-muted-foreground truncate max-w-[180px]",
                  children: m.name
                }), t !== "none" && a.jsx("td", {
                  className: "px-2 py-1 text-muted-foreground text-[10px] truncate max-w-[160px]",
                  children: m[t] || ""
                }), a.jsx("td", {
                  className: "px-2 py-1",
                  children: a.jsxs("div", {
                    className: "flex h-5 rounded overflow-hidden bg-muted/30",
                    children: [te(m.buyPct ?? 0,
                      "bg-emerald-600", "Buy",
                      "text-white"), te(m
                      .holdPct ?? 0,
                      "bg-zinc-500", "Hold",
                      "text-white"), te(m
                      .sellPct ?? 0,
                      "bg-red-600", "Sell",
                      "text-white")]
                  })
                }), a.jsx("td", {
                  className: `px-2 py-1 text-right font-mono tabular-nums ${m.buyPct!=null?pn(m.buyPct):""}`,
                  children: m.buyPct != null ?
                    `${m.buyPct.toFixed(0)}` : "—"
                }), a.jsx("td", {
                  className: "px-2 py-1 text-right font-mono tabular-nums text-zinc-300",
                  children: m.holdPct != null ?
                    `${m.holdPct.toFixed(0)}` : "—"
                }), a.jsx("td", {
                  className: `px-2 py-1 text-right font-mono tabular-nums ${m.sellPct!=null?mn(m.sellPct):""}`,
                  children: m.sellPct != null ?
                    `${m.sellPct.toFixed(0)}` : "—"
                }), a.jsx("td", {
                  className: "px-2 py-1 text-right font-mono tabular-nums text-muted-foreground",
                  children: m.totalCount
                }), a.jsx("td", {
                  className: "px-2 py-1 text-right font-mono tabular-nums text-emerald-400/80",
                  children: m.bullPct != null ?
                    `${m.bullPct.toFixed(0)}` : "—"
                }), a.jsx("td", {
                  className: "px-2 py-1 text-right font-mono tabular-nums text-red-400/80",
                  children: m.bearPct != null ?
                    `${m.bearPct.toFixed(0)}` : "—"
                })]
              }), k === m.ticker && a.jsx("tr", {
                children: a.jsx("td", {
                  colSpan: t !== "none" ? 10 : 9,
                  className: "p-0 border-b border-border/30",
                  children: a.jsx(dn, {
                    ticker: m.ticker
                  })
                })
              })]
            }, m.ticker))]
          }, o.label || "__all__"))
        })]
      })
    })]
  })
}
export {
  bn as
  default
};