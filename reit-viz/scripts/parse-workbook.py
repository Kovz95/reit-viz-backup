#!/usr/bin/env python3
"""
Server-side Excel workbook parser for REIT Viz.
Uses python-calamine (Rust) for xlsx/xlsm (30x faster than openpyxl).
Falls back to pyxlsb for .xlsb binary format.
Writes per-ticker JSON files directly to disk — no massive stdout JSON blob.
Outputs lightweight metadata JSON to stdout.
"""
import sys
import json
import os
import re
import time
import urllib.request
from datetime import datetime, timedelta

_YAHOO_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def fetch_yahoo_name(ticker, timeout=10):
    """Best-effort fetch of company name via Yahoo chart meta. Returns '' on failure."""
    try:
        url = f"https://query2.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=5d"
        req = urllib.request.Request(url, headers={"User-Agent": _YAHOO_UA})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
        meta = data["chart"]["result"][0]["meta"]
        return (meta.get("longName") or meta.get("shortName") or "").strip()
    except Exception:
        return ""

try:
    from python_calamine import CalamineWorkbook
except ImportError:
    CalamineWorkbook = None

try:
    from pyxlsb import open_workbook as open_xlsb
except ImportError:
    open_xlsb = None

# ─── Label-based row resolution ───
# Older versions of this parser used fixed row numbers, which broke when the
# workbook added/removed rows. We now locate each metric by matching the
# column-A label text against a list of token patterns. Labels are tokenized
# by splitting on non-alphanumerics and lowercased. Each rule must match the
# full ordered subsequence of tokens (gaps allowed) — token-boundary aware so
# "ps" doesn't match inside "eps" and "ffo" doesn't match inside "affo".
#
# Each entry: "metric output name" -> tuple of token patterns. Pattern semantics:
#   - lowercase string: must match a token exactly ("eps" matches "eps" not "epsfy1")
#   - if multiple patterns, they must appear in the label in order, with any
#     number of tokens (including zero) between them
METRIC_LABEL_RULES = [
    # name                     ordered token sequence (must appear in label, in order)
    ("close",                  ("stock", "price", "close")),
    ("open",                   ("stock", "price", "open")),
    ("low",                    ("stock", "price", "low")),
    ("high",                   ("stock", "price", "high")),
    ("EPS FY1",                ("eps", "fy1")),
    ("EPS FY2",                ("eps", "fy2")),
    ("EBITDA FY1",             ("ebitda", "fy1")),
    ("EBITDA FY2",             ("ebitda", "fy2")),
    ("FFO FY1",                ("ffo", "fy1")),
    ("FFO FY2",                ("ffo", "fy2")),
    ("AFFO FY1",               ("affo", "fy1")),
    ("AFFO FY2",               ("affo", "fy2")),
    ("Sales FY1",              ("sales", "fy1")),
    ("Sales FY2",              ("sales", "fy2")),
    ("EPS LTM",                ("eps", "ltm")),
    ("Sales LTM",              ("sales", "ltm")),
    ("EBITDA LTM",             ("ebitda", "ltm")),
    ("FFO LTM",                ("ffo", "ltm")),
    ("AFFO LTM",               ("affo", "ltm")),
    ("EPS FY0",                ("eps", "fy0")),
    ("FFO FY0",                ("ffo", "fy0")),
    ("AFFO FY0",               ("affo", "fy0")),
    ("Dividend",               ("dividend", "current", "annualized")),  # "Dividend (Current Annualized)"
    ("Enterprise Value",       ("enterprise", "value")),
    ("52wk High",              ("52", "week", "high")),
    ("52wk Low",               ("52", "week", "low")),
    ("1Y Price Chg%",          ("1", "year", "price", "change")),
    ("6M Price Chg%",          ("6", "month", "price", "change")),
    ("3M Price Chg%",          ("3", "month", "price", "change")),
    ("1M Price Chg%",          ("1", "month", "price", "change")),
    ("Short Interest%",        ("short", "interest")),
    ("Buy Ratings",            ("buy", "ratings")),
    ("Hold Ratings",           ("hold", "ratings")),
    ("Sell Ratings",           ("sell", "ratings")),
    ("Bull%",                  ("bull",)),
    ("Bear%",                  ("bear",)),
    # Growth labels are metric-first in the workbook ("EPS growth FY1"); the
    # canonical output names stay period-first ("FY1 EPS Growth") because the
    # client references those spellings. Token-exact matching keeps "ffo" from
    # matching inside "affo".
    ("FY1 EPS Growth",         ("eps", "growth", "fy1")),
    ("FY2 EPS Growth",         ("eps", "growth", "fy2")),
    ("FY1 FFO Growth",         ("ffo", "growth", "fy1")),
    ("FY2 FFO Growth",         ("ffo", "growth", "fy2")),
    ("FY1 AFFO Growth",        ("affo", "growth", "fy1")),
    ("FY2 AFFO Growth",        ("affo", "growth", "fy2")),
    ("FY1 EBITDA Growth",      ("ebitda", "growth", "fy1")),
    ("FY2 EBITDA Growth",      ("ebitda", "growth", "fy2")),
    ("% off 52wk High",        ("off", "52", "week", "high")),
    ("% off 52wk Low",         ("off", "52", "week", "low")),
    ("P/E LTM",                ("p", "e", "ltm")),
    ("P/E FY2",                ("p", "e", "fy2")),
    ("P/S LTM",                ("p", "s", "ltm")),
    ("P/S FY2",                ("p", "s", "fy2")),
    ("EV/EBITDA LTM",          ("ev", "ebitda", "ltm")),
    ("EV/EBITDA FY2",          ("ev", "ebitda", "fy2")),
    ("P/FFO LTM",              ("p", "ffo", "ltm")),
    ("P/FFO FY2",              ("p", "ffo", "fy2")),
    ("P/AFFO LTM",             ("p", "affo", "ltm")),
    ("P/AFFO FY2",             ("p", "affo", "fy2")),
    ("FFO Yield LTM",          ("ffo", "yield", "ltm")),
    ("FFO Yield FY2",          ("ffo", "yield", "fy2")),
    ("AFFO Yield LTM",         ("affo", "yield", "ltm")),
    ("AFFO Yield FY2",         ("affo", "yield", "fy2")),
    ("Dividend Yield",         ("dividend", "yield")),
]

_TOKEN_SPLIT_RE = re.compile(r"[^a-z0-9]+")

# Date row of every mktdata sheet (1-based). Rows at or above it are structural
# (ticker, start/end date, the date axis itself) and are never metric series.
DATE_ROW = 8

# Labels that sit BELOW the date row but still aren't metrics. The fiscal-period
# helper rows (FY0/FY1/FY2/Next fiscal quarter) hold Excel date serials, so they
# carry numbers and would survive as bogus metrics unless skipped explicitly.
# (Section-divider rows like "EUROPEAN REITs" carry no data and are dropped
# automatically downstream, so they don't need to be listed here.)
NON_METRIC_LABELS = {
    "fy0", "fy1", "fy2", "next fiscal quarter",
    "ticker", "start date", "end date", "daily", "date",
}

def _tokenize_label(raw):
    """Lowercase, split on non-alphanumerics, drop empty tokens."""
    if raw is None:
        return ()
    s = str(raw).lower()
    return tuple(t for t in _TOKEN_SPLIT_RE.split(s) if t)

def _tokens_match_in_order(tokens, patterns):
    """Return True if every pattern appears in tokens, in order (gaps OK)."""
    ti = 0
    for p in patterns:
        found_p = False
        while ti < len(tokens):
            if tokens[ti] == p:
                found_p = True
                ti += 1
                break
            ti += 1
        if not found_p:
            return False
    return True

def build_row_map_from_labels(rows, date_row=DATE_ROW):
    """Scan column A of each row and build {row_index_1based: metric_name}.
    Returns the row map plus a list of canonical metrics that couldn't be found
    (for logging). Token-aware: "p", "s" patterns only match standalone tokens,
    never substrings.

    Two passes:
      1. Canonical rules (METRIC_LABEL_RULES) map a curated set of rows to stable,
         client-facing short names ("close", "EPS FY1", "P/E LTM", ...). These names
         are depended on across the client, so they must not drift.
      2. Generic capture — every OTHER labeled row below the date row becomes a
         metric under its raw column-A label. This means metrics newly added to the
         workbook are picked up automatically, with no edits to this file. Rows that
         turn out to carry no data are dropped by the caller.
    """
    # Pre-tokenize column A for each row
    tokens_by_row = []
    for r in rows:
        a = r[0] if r and len(r) > 0 else None
        tokens_by_row.append(_tokenize_label(a))

    # ── Pass 1: canonical rules → stable short names ──
    found = {}
    found_metrics = set()
    for metric_name, patterns in METRIC_LABEL_RULES:
        for idx, toks in enumerate(tokens_by_row, start=1):
            if not toks:
                continue
            if _tokens_match_in_order(toks, patterns):
                if metric_name not in found_metrics:
                    found[idx] = metric_name
                    found_metrics.add(metric_name)
                break
    missing = [m for m, _ in METRIC_LABEL_RULES if m not in found_metrics]

    # ── Pass 2: generic capture of every other labeled metric row ──
    used_names = set(found_metrics)
    for idx, toks in enumerate(tokens_by_row, start=1):
        if idx <= date_row or idx in found or not toks:
            continue
        if " ".join(toks) in NON_METRIC_LABELS:
            continue
        raw = rows[idx - 1][0]
        name = " ".join(str(raw).split())  # trim + collapse internal whitespace
        if not name or name in used_names:
            continue
        found[idx] = name
        used_names.add(name)

    return found, missing

# Excel epoch for serial date conversion (pyxlsb returns dates as serial numbers)
EXCEL_EPOCH = datetime(1899, 12, 30)

def is_xlsb(file_path):
    """Check if file is .xlsb format."""
    return file_path.lower().endswith('.xlsb')

def serial_to_date(serial):
    """Convert Excel serial date number to YYYY-MM-DD string."""
    if serial is None:
        return None
    try:
        n = float(serial)
        if n != n or n < 1:  # NaN or invalid
            return None
        return (EXCEL_EPOCH + timedelta(days=n)).strftime("%Y-%m-%d")
    except (ValueError, TypeError, OverflowError):
        return None

def parse_date(val):
    """Parse a cell value to YYYY-MM-DD string."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, (int, float)):
        # Could be an Excel serial date number
        d = serial_to_date(val)
        if d:
            return d
    s = str(val).strip()
    if not s:
        return None
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', s)
    if m:
        return f"{m.group(3)}-{m.group(1).zfill(2)}-{m.group(2).zfill(2)}"
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', s)
    if m:
        return s
    return None

def clean_numeric(v):
    """Convert cell value to float or None."""
    if v is None or v == "" or v == " " or v is False:
        return None
    try:
        n = float(v)
        if n != n:  # NaN check
            return None
        return n
    except (ValueError, TypeError):
        return None

def rle(values):
    """Run-length encode null values."""
    encoded = []
    null_count = 0
    for v in values:
        if v is None:
            null_count += 1
        else:
            if null_count > 0:
                encoded.append(f"~{null_count}")
                null_count = 0
            encoded.append(round(v, 4) if isinstance(v, float) else v)
    if null_count > 0:
        encoded.append(f"~{null_count}")
    return encoded

def rle_decode(encoded, length):
    """Expand an RLE array (values + '~N' null-run tokens) to a dense list of `length`
    (null-padded/truncated). Inverse of rle()."""
    out = []
    for item in encoded:
        if isinstance(item, str) and item.startswith("~"):
            try:
                out.extend([None] * int(item[1:]))
            except ValueError:
                pass
        else:
            out.append(item)
    if len(out) < length:
        out.extend([None] * (length - len(out)))
    elif len(out) > length:
        out = out[:length]
    return out


# ─── Calamine parsing (xlsx/xlsm) — fast Rust-based engine ───

def parse_mktdata_sheet_calamine(rows, ticker):
    """Parse a mktdata sheet from calamine row data (list of lists)."""
    DATE_ROW = 8  # 1-based

    if len(rows) < DATE_ROW:
        return None

    # Build row map dynamically by matching column-A labels (workbook layout drifts over time)
    row_map, missing = build_row_map_from_labels(rows)
    if missing:
        print(f"  [{ticker}] missing metrics: {missing}", file=sys.stderr)

    # Parse dates from row 8 (0-based index 7)
    date_row = rows[DATE_ROW - 1]
    dates = []
    for i in range(1, len(date_row)):
        d = parse_date(date_row[i])
        if d:
            dates.append(d)
        else:
            break
    if not dates:
        return None

    # Extract needed rows
    data = {}
    metrics = []
    num_cols = len(dates)
    for row_num, metric_name in row_map.items():
        if row_num - 1 >= len(rows):
            continue
        row = rows[row_num - 1]
        values = []
        for c in range(1, min(num_cols + 1, len(row))):
            values.append(clean_numeric(row[c]))
        # Pad if row is shorter than dates
        while len(values) < num_cols:
            values.append(None)
        if any(v is not None for v in values):
            data[metric_name] = rle(values)
            metrics.append(metric_name)

    return dates, data, metrics


def parse_tickerlist_calamine(rows):
    """Parse Tickerlist sheet from calamine row data."""
    ticker_meta = {}
    for row in rows[1:]:  # Skip header
        if not row or not row[0]:
            continue
        raw_ticker = str(row[0]).replace("-US", "").strip()
        def gv(idx, default=""):
            if idx < len(row) and row[idx] is not None:
                return str(row[idx]).strip()
            return default
        ticker_meta[raw_ticker] = {
            "ticker": raw_ticker,
            "name": gv(1),
            "economy": gv(2),
            "sector": gv(3),
            "subsector": gv(4),
            "industryGroup": gv(5),
            "industry": gv(6),
            "subindustry": gv(7, "Other"),
        }
    return ticker_meta


def parse_events_calamine(rows):
    """Parse an event sheet from calamine row data."""
    events = {}
    for row in rows[1:]:  # Skip header
        if not row or not row[0]:
            continue
        ticker = str(row[0]).replace("-US^", "").replace("-US", "").strip()
        dates_list = []
        for c in range(1, len(row)):
            d = parse_date(row[c])
            if d:
                dates_list.append(d)
        events[ticker] = dates_list
    return events


# ─── pyxlsb parsing (xlsb) ───

def parse_mktdata_sheet_xlsb(ws, ticker, num_dates_hint=None):
    """Parse a mktdata sheet using pyxlsb row iterator.
    Materializes the sheet into a list-of-lists then applies label-based row resolution.
    """
    DATE_ROW = 8

    # Materialize the sheet into list-of-lists so we can use the same label-based
    # row resolution as the calamine path. The metric label needed rows are scattered
    # all the way through row ~130 anyway, so we read the whole sheet.
    rows = []
    for row in ws.rows():
        out_row = []
        for cell in row:
            out_row.append(cell.v if cell else None)
        rows.append(out_row)

    if len(rows) < DATE_ROW:
        return None

    # Build row map dynamically by matching column-A labels
    row_map, missing = build_row_map_from_labels(rows)
    if missing:
        print(f"  [{ticker}] missing metrics: {missing}", file=sys.stderr)

    # Parse dates from row 8
    date_row = rows[DATE_ROW - 1]
    dates = []
    for i in range(1, len(date_row)):
        d = parse_date(date_row[i])
        if d:
            dates.append(d)
        else:
            break
    if not dates:
        return None

    data = {}
    metrics = []
    num_cols = len(dates)
    for row_num, metric_name in row_map.items():
        if row_num - 1 >= len(rows):
            continue
        row = rows[row_num - 1]
        values = []
        for c in range(1, min(num_cols + 1, len(row))):
            values.append(clean_numeric(row[c]))
        while len(values) < num_cols:
            values.append(None)
        if any(v is not None for v in values):
            data[metric_name] = rle(values)
            metrics.append(metric_name)

    return dates, data, metrics


def parse_tickerlist_xlsb(ws):
    """Parse Tickerlist sheet using pyxlsb."""
    ticker_meta = {}
    first_row = True
    for row in ws.rows():
        if first_row:
            first_row = False
            continue
        if not row or not row[0] or not row[0].v:
            continue
        raw_ticker = str(row[0].v).replace("-US", "").strip()
        def gv(idx):
            """Get value from row at index."""
            if idx < len(row) and row[idx] and row[idx].v is not None:
                return str(row[idx].v).strip()
            return ""
        ticker_meta[raw_ticker] = {
            "ticker": raw_ticker,
            "name": gv(1),
            "economy": gv(2),
            "sector": gv(3),
            "subsector": gv(4),
            "industryGroup": gv(5),
            "industry": gv(6),
            "subindustry": gv(7) or "Other",
        }
    return ticker_meta


def parse_events_xlsb(ws):
    """Parse an event sheet using pyxlsb."""
    events = {}
    first_row = True
    for row in ws.rows():
        if first_row:
            first_row = False
            continue
        if not row or not row[0] or not row[0].v:
            continue
        ticker = str(row[0].v).replace("-US^", "").replace("-US", "").strip()
        dates_list = []
        for c in range(1, len(row)):
            v = row[c].v if row[c] else None
            d = parse_date(v)
            if d:
                dates_list.append(d)
        events[ticker] = dates_list
    return events


# ─── Unified workbook parser ───

def parse_workbook(file_path, output_dir=None):
    """Parse workbook and optionally write ticker files directly to output_dir.
    
    If output_dir is set, writes per-ticker JSON files to output_dir/tickers/
    and returns only metadata (no tickerData in result).
    If output_dir is None, returns full tickerData in result (legacy mode).
    """
    xlsb = is_xlsb(file_path)
    use_calamine = (not xlsb) and (CalamineWorkbook is not None)
    
    if xlsb:
        if open_xlsb is None:
            raise RuntimeError("pyxlsb not installed — cannot parse .xlsb files")
        wb = open_xlsb(file_path)
        sheet_names = wb.sheets
    elif use_calamine:
        wb = CalamineWorkbook.from_path(file_path)
        sheet_names = wb.sheet_names
        print(f"  Using calamine (fast Rust engine)", file=sys.stderr)
    else:
        raise RuntimeError("python-calamine not installed — cannot parse .xlsx/.xlsm files")
    
    mktdata_sheets = [s for s in sheet_names if "_mktdata" in s.lower()]
    tickerlist_sheet = None
    for s in sheet_names:
        if s.lower() in ("tickerlist", "ticker list"):
            tickerlist_sheet = s
            break
    
    all_dates = []
    tickers_map = {}
    events = {}
    
    # Set up output directory for direct file writes
    ticker_out_dir = None
    if output_dir:
        ticker_out_dir = os.path.join(output_dir, "tickers")
        os.makedirs(ticker_out_dir, exist_ok=True)
    
    ticker_data_legacy = {}  # Only used if output_dir is None
    
    # Buffer per-ticker (local_dates, data) so we can realign to a global UNION of dates after
    # all sheets are parsed. Without this, different trading calendars across regions (US 4126,
    # UK 4143, IT 4166, IN 4196) would cause positional misalignment vs the global dates axis.
    pending_tickers = []  # list of (ticker, local_dates, data)
    
    total_sheets = len(mktdata_sheets)
    
    # Write progress file so the server can report status to the client
    progress_file = os.path.join(output_dir, ".progress.json") if output_dir else None
    
    def update_progress(current, total, ticker_name, phase="parsing"):
        if progress_file:
            try:
                with open(progress_file, "w") as f:
                    json.dump({"phase": phase, "current": current, "total": total, "ticker": ticker_name}, f)
            except:
                pass
    
    # Parse mktdata sheets
    for idx, sheet_name in enumerate(mktdata_sheets):
        ticker = re.sub(r'-US_mktdata', '', sheet_name, flags=re.IGNORECASE)
        ticker = re.sub(r'_mktdata', '', ticker, flags=re.IGNORECASE).strip()
        
        update_progress(idx + 1, total_sheets, ticker)
        
        if xlsb:
            with wb.get_sheet(sheet_name) as ws:
                result = parse_mktdata_sheet_xlsb(ws, ticker)
        elif use_calamine:
            sheet = wb.get_sheet_by_name(sheet_name)
            rows = sheet.to_python()
            result = parse_mktdata_sheet_calamine(rows, ticker)
        
        if result is None:
            print(f"  [{idx+1}/{total_sheets}] Skipped {ticker} (no data)", file=sys.stderr)
            continue
        
        dates, data, metrics = result
        
        tickers_map[ticker] = {"ticker": ticker, "dates": len(dates), "metrics": metrics}
        
        # Buffer for post-parse realignment (do NOT write per-ticker files yet)
        pending_tickers.append((ticker, dates, data))
        
        print(f"  [{idx+1}/{total_sheets}] {ticker}: {len(dates)} dates, {len(metrics)} metrics", file=sys.stderr)
    
    # Build global date axis as UNION of all tickers' dates (sorted ISO strings sort chronologically)
    date_set = set()
    for _, local_dates, _ in pending_tickers:
        date_set.update(local_dates)
    all_dates = sorted(date_set)
    global_index = {d: i for i, d in enumerate(all_dates)}
    global_len = len(all_dates)
    print(f"  Global date axis: {global_len} unique dates (union of {len(pending_tickers)} tickers)", file=sys.stderr)
    
    # Realign each ticker's metric arrays to the global axis, then write.
    # The per-metric arrays are RLE-encoded, so they must be decoded to a dense
    # series (one slot per local date) before remapping by date — indexing the
    # RLE array positionally would scatter the "~N" tokens. Re-encode after.
    for ticker, local_dates, data in pending_tickers:
        # Map local index -> global index for this ticker
        local_to_global = [global_index[d] for d in local_dates]
        local_len = len(local_dates)
        realigned = {}
        for metric_name, values in data.items():
            dense = rle_decode(values, local_len)  # align to local_dates
            new_arr = [None] * global_len
            for li in range(local_len):
                v = dense[li]
                if v is not None:
                    new_arr[local_to_global[li]] = v
            realigned[metric_name] = rle(new_arr)
        
        if ticker_out_dir:
            with open(os.path.join(ticker_out_dir, f"{ticker}.json"), "w") as f:
                json.dump(realigned, f)
        else:
            ticker_data_legacy[ticker] = realigned
    
    # Parse Tickerlist
    ticker_meta = {}
    if tickerlist_sheet and tickerlist_sheet in sheet_names:
        if xlsb:
            with wb.get_sheet(tickerlist_sheet) as ws:
                ticker_meta = parse_tickerlist_xlsb(ws)
        elif use_calamine:
            sheet = wb.get_sheet_by_name(tickerlist_sheet)
            rows = sheet.to_python()
            ticker_meta = parse_tickerlist_calamine(rows)
        print(f"  Parsed Ticker List: {len(ticker_meta)} entries", file=sys.stderr)
    
    # Parse event sheets
    for ev_name, ev_key in [("Ex dividend dates", "ex_dividend"), ("Earnings report dates", "earnings")]:
        found_name = None
        for s in sheet_names:
            if s.lower() == ev_name.lower():
                found_name = s
                break
        if found_name:
            if xlsb:
                with wb.get_sheet(found_name) as ws:
                    ev_data = parse_events_xlsb(ws)
            elif use_calamine:
                sheet = wb.get_sheet_by_name(found_name)
                rows = sheet.to_python()
                ev_data = parse_events_calamine(rows)
            for ticker, dates_list in ev_data.items():
                if ticker not in events:
                    events[ticker] = {}
                events[ticker][ev_key] = dates_list
            print(f"  Parsed {ev_name}: {len(ev_data)} tickers", file=sys.stderr)
    
    if hasattr(wb, 'close'):
        wb.close()
    
    # Build tickers array with metadata
    tickers = []
    missing_name_syms = []
    for t_info in sorted(tickers_map.values(), key=lambda x: x["ticker"]):
        meta = ticker_meta.get(t_info["ticker"], {
            "ticker": t_info["ticker"],
            "name": "",
            "economy": "", "sector": "", "subsector": "",
            "industryGroup": "", "industry": "Other", "subindustry": "Other",
        })
        if not (meta.get("name") or "").strip():
            missing_name_syms.append(t_info["ticker"])
        tickers.append({
            **meta,
            "dates": t_info["dates"],
            "metrics": t_info["metrics"],
        })

    # Yahoo fallback: enrich any blank 'name' fields via Yahoo chart meta.
    # Tickerlist sometimes ships with blank column B for ~35% of rows; this guarantees
    # the Charts/Data tabs show real company names instead of just the symbol.
    if missing_name_syms:
        print(f"  Enriching {len(missing_name_syms)} blank names via Yahoo...", file=sys.stderr)
        name_map = {}
        for sym in missing_name_syms:
            nm = fetch_yahoo_name(sym)
            if nm:
                name_map[sym] = nm
            time.sleep(0.25)
        if name_map:
            for t in tickers:
                if not (t.get("name") or "").strip() and t["ticker"] in name_map:
                    t["name"] = name_map[t["ticker"]]
            print(f"  Yahoo name fallback filled {len(name_map)}/{len(missing_name_syms)} names", file=sys.stderr)
        # Final fallback: any still-blank names default to the ticker symbol
        for t in tickers:
            if not (t.get("name") or "").strip():
                t["name"] = t["ticker"]
    
    result = {
        "ok": True,
        "tickers": tickers,
        "dates": all_dates,
        "events": events,
    }
    
    if output_dir:
        # Write dates, events, tickers metadata to output_dir as well
        with open(os.path.join(output_dir, "dates.json"), "w") as f:
            json.dump(all_dates, f)
        with open(os.path.join(output_dir, "events.json"), "w") as f:
            json.dump(events, f, indent=2)
        with open(os.path.join(output_dir, "tickers.json"), "w") as f:
            json.dump(tickers, f, indent=2)
    else:
        result["tickerData"] = ticker_data_legacy
    
    return result

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: parse-workbook.py <file_path> [output_dir]"}))
        sys.exit(1)
    
    file_path = sys.argv[1]
    output_dir = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not os.path.exists(file_path):
        print(json.dumps({"error": f"File not found: {file_path}"}))
        sys.exit(1)
    
    fmt = "xlsb" if is_xlsb(file_path) else "xlsx/xlsm"
    print(f"Parsing {file_path} ({os.path.getsize(file_path)/1024/1024:.1f} MB) [format: {fmt}]...", file=sys.stderr)
    if output_dir:
        print(f"Output directory: {output_dir}", file=sys.stderr)
    
    try:
        result = parse_workbook(file_path, output_dir)
        print(f"Done: {len(result['tickers'])} tickers, {len(result['dates'])} dates", file=sys.stderr)
        # Stdout: only metadata (small). tickerData is written to disk directly.
        json.dump(result, sys.stdout)
    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
