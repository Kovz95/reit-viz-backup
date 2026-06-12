"""
fast_xlsb.py — High-performance .xlsb reader
=============================================
Reads raw ZIP entries and parses BIFF12 binary records directly,
bypassing pyxlsb's Python-level row iteration for a ~3x speed improvement.

Only reads up to a configurable max_row per sheet (default 127).
"""

import zipfile
import struct
import xml.etree.ElementTree as ET

# Pre-compiled struct formats for speed
_uint32 = struct.Struct('<I')
_int32 = struct.Struct('<i')
_double = struct.Struct('<d')
_ZERO4 = b'\x00\x00\x00\x00'

# BIFF12 record types we care about
_RT_ROW = 0x0000
_RT_NUM = 0x0002        # BrtCellRk (RK-encoded number)
_RT_FLOAT = 0x0005      # BrtCellReal (IEEE double)
_RT_STRING = 0x0007     # BrtCellIsst (shared string index)
_RT_FMLA_STR = 0x0008   # BrtFmlaString
_RT_FMLA_FLOAT = 0x0009 # BrtFmlaNum
_RT_BOOL = 0x0004       # BrtCellBool
_RT_SST_ITEM = 0x0013   # BrtSSTItem (shared string table entry)
_RT_BUNDLE_SH = 0x009C  # BrtBundleSh (sheet definition in workbook.bin)

# Cell types to process
_CELL_TYPES = {_RT_NUM, _RT_FLOAT, _RT_STRING, _RT_FMLA_STR, _RT_FMLA_FLOAT, _RT_BOOL}


def _read_record(buf, pos):
    """Read a single BIFF12 record. Returns (type, data_start, data_len, new_pos).
    Uses a memoryview-friendly approach to avoid copies."""
    blen = len(buf)
    if pos >= blen:
        return -1, 0, 0, pos

    # Record type: 1 or 2 bytes
    rt = buf[pos]; pos += 1
    if rt & 0x80:
        if pos >= blen:
            return -1, 0, 0, pos
        rt = (rt & 0x7F) | (buf[pos] << 7); pos += 1

    # Record size: 1-4 bytes (variable-length encoding)
    if pos >= blen:
        return -1, 0, 0, pos
    sz = buf[pos]; pos += 1
    if sz & 0x80:
        if pos >= blen:
            return rt, pos, 0, pos
        sz = (sz & 0x7F) | ((buf[pos] & 0x7F) << 7); pos += 1
        if sz & (1 << 14):
            if pos >= blen:
                return rt, pos, 0, pos
            sz = (sz & 0x3FFF) | ((buf[pos] & 0x7F) << 14); pos += 1
            if sz & (1 << 21):
                if pos >= blen:
                    return rt, pos, 0, pos
                sz = (sz & 0x1FFFFF) | (buf[pos] << 21); pos += 1

    data_start = pos
    return rt, data_start, sz, pos + sz


def _rk_to_float(rk_int):
    """Decode 4-byte RK value to Python float."""
    if rk_int & 0x02:
        v = float(rk_int >> 2)
    else:
        v = _double.unpack(_ZERO4 + _uint32.pack(rk_int & 0xFFFFFFFC))[0]
    if rk_int & 0x01:
        v /= 100.0
    return v


class FastXlsbReader:
    """High-performance .xlsb workbook reader."""

    def __init__(self, path):
        self._zf = zipfile.ZipFile(path, 'r')
        self._shared_strings = None
        self._sheet_map = None   # name -> zip path

    def close(self):
        self._zf.close()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    # ── Shared strings ──

    def _load_shared_strings(self):
        if self._shared_strings is not None:
            return
        sst_path = 'xl/sharedStrings.bin'
        if sst_path not in self._zf.namelist():
            self._shared_strings = []
            return

        raw = self._zf.read(sst_path)
        strings = []
        pos = 0
        blen = len(raw)
        while pos < blen:
            rt, ds, dl, pos = _read_record(raw, pos)
            if rt == -1:
                break
            if rt == _RT_SST_ITEM and dl >= 5:
                str_len = _uint32.unpack_from(raw, ds + 1)[0]
                s = raw[ds + 5:ds + 5 + str_len * 2].decode('utf-16-le', errors='replace')
                strings.append(s)
        self._shared_strings = strings

    # ── Sheet mapping ──

    def _load_sheet_map(self):
        if self._sheet_map is not None:
            return

        # Parse relationships
        rels_xml = self._zf.read('xl/_rels/workbook.bin.rels').decode('utf-8')
        rels_root = ET.fromstring(rels_xml)
        rid_to_path = {}
        for rel in rels_root:
            rid = rel.get('Id')
            target = rel.get('Target')
            if rid and target:
                path = 'xl/' + target if not target.startswith('/') else target.lstrip('/')
                rid_to_path[rid] = path

        # Parse workbook.bin for sheet names
        wb_raw = self._zf.read('xl/workbook.bin')
        pos = 0
        blen = len(wb_raw)
        self._sheet_map = {}

        while pos < blen:
            rt, ds, dl, pos = _read_record(wb_raw, pos)
            if rt == -1:
                break
            if rt == _RT_BUNDLE_SH and dl >= 12:
                # visibility(4) + sheet_id(4) + rId string + name string
                rid_len = _uint32.unpack_from(wb_raw, ds + 8)[0]
                rid = wb_raw[ds + 12:ds + 12 + rid_len * 2].decode('utf-16-le', errors='replace')
                name_off = ds + 12 + rid_len * 2
                name_len = _uint32.unpack_from(wb_raw, name_off)[0]
                name = wb_raw[name_off + 4:name_off + 4 + name_len * 2].decode('utf-16-le', errors='replace')
                if rid in rid_to_path:
                    self._sheet_map[name] = rid_to_path[rid]

    @property
    def sheet_names(self):
        self._load_sheet_map()
        return list(self._sheet_map.keys())

    # ── Sheet reading ──

    def read_sheet_rows(self, sheet_name, needed_rows=None, max_row=127):
        """Read specific rows from a sheet.

        Args:
            sheet_name: Name of the sheet to read.
            needed_rows: Set of 0-indexed row numbers to return. If None, returns all rows up to max_row.
            max_row: Stop reading after this 0-indexed row number.

        Returns:
            dict mapping 0-indexed row number to list of cell values (with None for empty cells).
        """
        self._load_sheet_map()
        self._load_shared_strings()

        zip_path = self._sheet_map.get(sheet_name)
        if not zip_path:
            return {}

        raw = self._zf.read(zip_path)
        ss = self._shared_strings
        pos = 0
        blen = len(raw)
        rows = {}
        current_row = -1
        current_cells = {}

        while pos < blen:
            rt, ds, dl, pos = _read_record(raw, pos)
            if rt == -1:
                break

            if rt == _RT_ROW:
                # Save previous row if needed
                if current_row >= 0 and current_cells and (needed_rows is None or current_row in needed_rows):
                    max_col = max(current_cells.keys())
                    rows[current_row] = [current_cells.get(c) for c in range(max_col + 1)]
                # Read new row number
                current_row = _uint32.unpack_from(raw, ds)[0]
                current_cells = {}
                if current_row > max_row:
                    break

            elif rt == _RT_NUM and dl >= 12:
                # BrtCellRk: col(4) + style(4) + rk(4)
                col = _uint32.unpack_from(raw, ds)[0]
                rk_int = _int32.unpack_from(raw, ds + 8)[0]
                current_cells[col] = _rk_to_float(rk_int)

            elif rt == _RT_FLOAT and dl >= 16:
                # BrtCellReal: col(4) + style(4) + double(8)
                col = _uint32.unpack_from(raw, ds)[0]
                current_cells[col] = _double.unpack_from(raw, ds + 8)[0]

            elif rt == _RT_STRING and dl >= 12:
                # BrtCellIsst: col(4) + style(4) + ssi(4)
                col = _uint32.unpack_from(raw, ds)[0]
                ssi = _uint32.unpack_from(raw, ds + 8)[0]
                if ss and ssi < len(ss):
                    current_cells[col] = ss[ssi]

            elif rt == _RT_FMLA_STR and dl >= 12:
                # BrtFmlaString: col(4) + style(4) + string
                col = _uint32.unpack_from(raw, ds)[0]
                str_len = _uint32.unpack_from(raw, ds + 8)[0]
                s = raw[ds + 12:ds + 12 + str_len * 2].decode('utf-16-le', errors='replace')
                current_cells[col] = s

            elif rt == _RT_FMLA_FLOAT and dl >= 16:
                # BrtFmlaNum: col(4) + style(4) + double(8)
                col = _uint32.unpack_from(raw, ds)[0]
                current_cells[col] = _double.unpack_from(raw, ds + 8)[0]

            elif rt == _RT_BOOL and dl >= 9:
                # BrtCellBool: col(4) + style(4) + bool(1)
                col = _uint32.unpack_from(raw, ds)[0]
                current_cells[col] = bool(raw[ds + 8])

        # Don't forget the last row
        if current_row >= 0 and current_row <= max_row and current_cells:
            if needed_rows is None or current_row in needed_rows:
                max_col = max(current_cells.keys())
                rows[current_row] = [current_cells.get(c) for c in range(max_col + 1)]

        return rows
