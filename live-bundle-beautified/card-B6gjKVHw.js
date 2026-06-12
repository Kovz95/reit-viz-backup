import {
    r as d,
    j as s,
    dc as t
} from "./index-CsG73Aq_.js";
const o = d.forwardRef(({
    className: a,
    ...e
}, r) => s.jsx("div", {
    ref: r,
    className: t("shadcn-card rounded-xl border bg-card border-card-border text-card-foreground shadow-sm", a),
    ...e
}));
o.displayName = "Card";
const c = d.forwardRef(({
    className: a,
    ...e
}, r) => s.jsx("div", {
    ref: r,
    className: t("flex flex-col space-y-1.5 p-6", a),
    ...e
}));
c.displayName = "CardHeader";
const i = d.forwardRef(({
    className: a,
    ...e
}, r) => s.jsx("div", {
    ref: r,
    className: t("text-2xl font-semibold leading-none tracking-tight", a),
    ...e
}));
i.displayName = "CardTitle";
const n = d.forwardRef(({
    className: a,
    ...e
}, r) => s.jsx("div", {
    ref: r,
    className: t("text-sm text-muted-foreground", a),
    ...e
}));
n.displayName = "CardDescription";
const l = d.forwardRef(({
    className: a,
    ...e
}, r) => s.jsx("div", {
    ref: r,
    className: t("p-6 pt-0", a),
    ...e
}));
l.displayName = "CardContent";
const m = d.forwardRef(({
    className: a,
    ...e
}, r) => s.jsx("div", {
    ref: r,
    className: t("flex items-center p-6 pt-0", a),
    ...e
}));
m.displayName = "CardFooter";
export {
    o as C, c as a, i as b, l as c
};