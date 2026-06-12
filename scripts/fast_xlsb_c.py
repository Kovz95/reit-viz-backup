"""
fast_xlsb_c.py — Ultra-fast .xlsb reader using C extension
============================================================
Uses a compiled C shared library (biff12_parse.so) for the hot
BIFF12 record parsing loop, with Python handling ZIP I/O and
string decoding. ~10x faster than pure Python fast_xlsb.py.
"""

import zipfile
import struct
import ctypes
import os
import xml.etree.ElementTree as ET

# Load the C shared library
_dir = os.path.dirname(os.path.abspath(__file__))
_lib = ctypes.CDLL(os.path.join(_dir, "biff12_parse.so"))

# Cell struct: row(4) + col(4) + type(1) + pad(3) + value(8) + str_offset(4) + str_bytelen(4) = 28 bytes
class _CCell(ctypes.Structure):
    _fields_ = [
        ("row", ctypes.c_uint32),
        ("col", ctypes.c_uint32),
        ("type", ctypes.c_uint8),
        ("_pad", ctypes.c_uint8 * 3),
        ("value", ctypes.c_double),
        ("str_offset", ctypes.c_uint32),
        ("str_bytelen", ctypes.c_uint32),
    ]

# Function signatures
_lib.parse_sheet.argtypes = [
    ctypes.c_char_p,    # buf
    ctypes.c_uint32,    # buf_len
    ctypes.c_uint32,    # max_row
    ctypes.POINTER(_CCell),  # out
    ctypes.c_uint32,    # out_cap
    ctypes.c_char_p,    # row_mask (NULL = all rows)
    ctypes.c_uint32,    # mask_len
]
_lib.parse_sheet.restype = ctypes.c_int

_lib.parse_sst.argtypes = [
    ctypes.c_char_p,    # buf
    ctypes.c_uint32,    # buf_len
    ctypes.POINTER(ctypes.c_uint32),  # out_offsets
    ctypes.c_uint32,    # out_cap
]
_lib.parse_sst.restype = ctypes.c_int

# Cell type constants (must match C header)
CELL_EMPTY = 0
CELL_FLOAT = 1
CELL_STRING = 2
CELL_BOOL = 3
CELL_FMLA_STR = 4

# BIFF12 record types for workbook.bin
_RT_BUNDLE_SH = 0x009C
_uint32 = struct.Struct('<I')


class FastXlsbReader:
    """Ultra-fast .xlsb workbook reader backed by C extension."""

    # Pre-allocate a reusable cell buffer (640K cells * 28 bytes ≈ 17MB)
    _MAX_CELLS = 640000
    _CellArray = (_CCell * _MAX_CELLS)

    def __init__(self, path):
        self._zf = zipfile.ZipFile(path, 'r')
        self._shared_strings = None
        self._sheet_map = None
        self._cells = self._CellArray()

    def close(self):
        self._zf.close()

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()

    # ── Shared strings (C-accelerated) ──

    def _load_shared_strings(self):
        if self._shared_strings is not None:
            return
        sst_path = 'xl/sharedStrings.bin'
        if sst_path not in self._zf.namelist():
            self._shared_strings = []
            return

        raw = self._zf.read(sst_path)
        buf_len = len(raw)

        # Allocate output for string offsets (pairs of uint32)
        max_strings = 100000
        OffsetArray = (ctypes.c_uint32 * (max_strings * 2))
        offsets = OffsetArray()

        n = _lib.parse_sst(raw, buf_len, offsets, max_strings)

        # Decode strings from raw buffer using offsets
        strings = []
        for i in range(n):
            off = offsets[i * 2]
            blen = offsets[i * 2 + 1]
            if off + blen <= buf_len:
                s = raw[off:off + blen].decode('utf-16-le', errors='replace')
            else:
                s = ""
            strings.append(s)

        self._shared_strings = strings

    # ── Sheet mapping (same as pure Python version) ──

    def _load_sheet_map(self):
        if self._sheet_map is not None:
            return

        rels_xml = self._zf.read('xl/_rels/workbook.bin.rels').decode('utf-8')
        rels_root = ET.fromstring(rels_xml)
        rid_to_path = {}
        for rel in rels_root:
            rid = rel.get('Id')
            target = rel.get('Target')
            if rid and target:
                path = 'xl/' + target if not target.startswith('/') else target.lstrip('/')
                rid_to_path[rid] = path

        wb_raw = self._zf.read('xl/workbook.bin')
        pos = 0
        blen = len(wb_raw)
        self._sheet_map = {}

        while pos < blen:
            # Read record
            if pos >= blen:
                break
            rt = wb_raw[pos]; pos += 1
            if rt & 0x80:
                if pos >= blen: break
                rt = (rt & 0x7F) | (wb_raw[pos] << 7); pos += 1
            if pos >= blen: break
            sz = wb_raw[pos]; pos += 1
            if sz & 0x80:
                if pos >= blen: break
                sz = (sz & 0x7F) | ((wb_raw[pos] & 0x7F) << 7); pos += 1
                if sz & (1 << 14):
                    if pos >= blen: break
                    sz = (sz & 0x3FFF) | ((wb_raw[pos] & 0x7F) << 14); pos += 1
                    if sz & (1 << 21):
                        if pos >= blen: break
                        sz = (sz & 0x1FFFFF) | (wb_raw[pos] << 21); pos += 1
            ds = pos
            dl = sz
            pos += sz

            if rt == _RT_BUNDLE_SH and dl >= 12:
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

    # ── Sheet reading (C-accelerated) ──

    def read_sheet_rows(self, sheet_name, needed_rows=None, max_row=127):
        """Read specific rows from a sheet using C extension.

        Args:
            sheet_name: Name of the sheet to read.
            needed_rows: Set of 0-indexed row numbers to return. If None, returns all.
            max_row: Stop reading after this 0-indexed row number.

        Returns:
            dict mapping 0-indexed row number to list of cell values.
        """
        self._load_sheet_map()
        self._load_shared_strings()

        zip_path = self._sheet_map.get(sheet_name)
        if not zip_path:
            return {}

        raw = self._zf.read(zip_path)
        buf_len = len(raw)
        ss = self._shared_strings

        # Build row bitmask if needed_rows is specified
        if needed_rows is not None:
            mask_bytes = bytearray(16)  # 128 bits = rows 0-127
            for r in needed_rows:
                if 0 <= r <= 127:
                    mask_bytes[r >> 3] |= (1 << (r & 7))
            mask = bytes(mask_bytes)
            n_cells = _lib.parse_sheet(raw, buf_len, max_row, self._cells, self._MAX_CELLS, mask, len(mask))
        else:
            n_cells = _lib.parse_sheet(raw, buf_len, max_row, self._cells, self._MAX_CELLS, None, 0)

        # Convert C cells to Python dict
        rows = {}
        cells = self._cells
        for i in range(n_cells):
            c = cells[i]
            r = c.row

            col = c.col
            if c.type == CELL_FLOAT:
                val = c.value
            elif c.type == CELL_STRING:
                ssi = int(c.value)
                val = ss[ssi] if ss and ssi < len(ss) else None
            elif c.type == CELL_BOOL:
                val = bool(int(c.value))
            elif c.type == CELL_FMLA_STR:
                off = c.str_offset
                blen = c.str_bytelen
                if off + blen <= buf_len:
                    val = raw[off:off + blen].decode('utf-16-le', errors='replace')
                else:
                    val = ""
            else:
                val = None

            if r not in rows:
                rows[r] = {}
            rows[r][col] = val

        # Convert col dicts to lists
        result = {}
        for r, col_dict in rows.items():
            if col_dict:
                max_col = max(col_dict.keys())
                result[r] = [col_dict.get(c) for c in range(max_col + 1)]

        return result
