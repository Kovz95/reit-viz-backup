"""
fast_xlsb_v2.py — Ultra-fast .xlsb reader using dense C arrays
================================================================
Uses biff12_fast.so which outputs a dense (slots x cols) double array
instead of individual cell structs. This eliminates 26M Python object
creations, making the Python-side conversion nearly free.

Drop-in replacement for fast_xlsb.FastXlsbReader.
"""

import zipfile
import struct
import ctypes
import numpy as np
import os
import xml.etree.ElementTree as ET

# Load the C shared library
_dir = os.path.dirname(os.path.abspath(__file__))
_lib = ctypes.CDLL(os.path.join(_dir, "biff12_fast.so"))

# Function signatures
_lib.parse_sheet_dense.argtypes = [
    ctypes.c_char_p,                    # buf
    ctypes.c_uint32,                    # buf_len
    ctypes.POINTER(ctypes.c_int32),     # row_slots
    ctypes.c_uint32,                    # n_row_slots
    ctypes.c_uint32,                    # max_row
    ctypes.c_uint32,                    # max_cols
    ctypes.POINTER(ctypes.c_double),    # values
    ctypes.POINTER(ctypes.c_int32),     # strings (SSI indices)
    ctypes.POINTER(ctypes.c_uint32),    # fmla_offsets
    ctypes.POINTER(ctypes.c_uint32),    # fmla_lengths
]
_lib.parse_sheet_dense.restype = ctypes.c_int

_lib.parse_sst.argtypes = [
    ctypes.c_char_p,
    ctypes.c_uint32,
    ctypes.POINTER(ctypes.c_uint32),
    ctypes.c_uint32,
]
_lib.parse_sst.restype = ctypes.c_int

# Sentinel values — must match C header
SENTINEL_STRING  = -9.999e200
SENTINEL_FMLA    = -9.998e200
SENTINEL_BOOL_T  = -9.997e200
SENTINEL_BOOL_F  = -9.996e200

_uint32 = struct.Struct('<I')
_RT_BUNDLE_SH = 0x009C


class FastXlsbReader:
    """Ultra-fast .xlsb workbook reader using dense C arrays."""

    def __init__(self, path):
        self._zf = zipfile.ZipFile(path, 'r')
        self._shared_strings = None
        self._sheet_map = None

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
        max_strings = 100000
        OffsetArray = (ctypes.c_uint32 * (max_strings * 2))
        offsets = OffsetArray()
        n = _lib.parse_sst(raw, len(raw), offsets, max_strings)

        strings = []
        buf_len = len(raw)
        for i in range(n):
            off = offsets[i * 2]
            blen = offsets[i * 2 + 1]
            if off + blen <= buf_len:
                s = raw[off:off + blen].decode('utf-16-le', errors='replace')
            else:
                s = ""
            strings.append(s)
        self._shared_strings = strings

    # ── Sheet mapping ──

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
            if pos >= blen: break
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

    # ── Sheet reading (dense C arrays) ──

    def read_sheet_rows(self, sheet_name, needed_rows=None, max_row=127):
        """Read specific rows from a sheet.

        Returns: dict mapping 0-indexed row number to list of cell values.
        """
        self._load_sheet_map()
        self._load_shared_strings()

        zip_path = self._sheet_map.get(sheet_name)
        if not zip_path:
            return {}

        raw = self._zf.read(zip_path)
        buf_len = len(raw)
        ss = self._shared_strings

        # Build row_slots array: maps row number -> output slot index
        # Rows not in needed_rows get slot -1
        if needed_rows is not None:
            rows_list = sorted(needed_rows)
        else:
            rows_list = list(range(max_row + 1))

        n_slots = len(rows_list)
        if n_slots == 0:
            return {}

        # Create row_slots mapping
        n_row_entries = max_row + 1
        RowSlots = (ctypes.c_int32 * n_row_entries)
        row_slots = RowSlots(*[-1] * n_row_entries)
        for slot_idx, row_num in enumerate(rows_list):
            if row_num < n_row_entries:
                row_slots[row_num] = slot_idx

        # Allocate output arrays
        # Use a reasonable max_cols — detect from first pass or use 4500
        max_cols = 4500

        total_cells = n_slots * max_cols
        Values = (ctypes.c_double * total_cells)
        Strings = (ctypes.c_int32 * total_cells)
        FmlaOff = (ctypes.c_uint32 * total_cells)
        FmlaLen = (ctypes.c_uint32 * total_cells)

        values = Values()
        strings = Strings()
        fmla_off = FmlaOff()
        fmla_len = FmlaLen()

        # Initialize: NaN for values, -1 for strings
        ctypes.memset(values, 0xFF, ctypes.sizeof(values))  # fills with NaN
        ctypes.memset(strings, 0xFF, ctypes.sizeof(strings))  # fills with -1 (0xFFFFFFFF)
        ctypes.memset(fmla_off, 0, ctypes.sizeof(fmla_off))
        ctypes.memset(fmla_len, 0, ctypes.sizeof(fmla_len))

        _lib.parse_sheet_dense(
            raw, buf_len,
            row_slots, n_row_entries,
            max_row, max_cols,
            values, strings, fmla_off, fmla_len
        )

        # Convert dense arrays to Python dicts using numpy (bulk vectorized)
        vals_np = np.frombuffer(values, dtype=np.float64).reshape(n_slots, max_cols)
        strs_np = np.frombuffer(strings, dtype=np.int32).reshape(n_slots, max_cols)
        foff_np = np.frombuffer(fmla_off, dtype=np.uint32).reshape(n_slots, max_cols)
        flen_np = np.frombuffer(fmla_len, dtype=np.uint32).reshape(n_slots, max_cols)

        result = {}
        for slot_idx, row_num in enumerate(rows_list):
            row_vals = vals_np[slot_idx]

            # Find last non-NaN column
            non_nan_mask = ~np.isnan(row_vals)
            non_nan_indices = np.nonzero(non_nan_mask)[0]
            if len(non_nan_indices) == 0:
                continue

            last_col = int(non_nan_indices[-1])
            # Slice to only the relevant portion
            rv = row_vals[:last_col + 1]
            nm = non_nan_mask[:last_col + 1]

            # Check for any sentinel values in this row
            nn_vals = rv[nm]
            has_sentinels = np.any(nn_vals < -9.99e200)

            if not has_sentinels:
                # Fast path: all values are plain floats
                # Use np.where to create a mixed array, then tolist()
                # This avoids per-element Python iteration
                row_list = [None] * (last_col + 1)
                for ci in non_nan_indices:
                    ci_int = int(ci)
                    if ci_int > last_col:
                        break
                    row_list[ci_int] = float(rv[ci_int])
            else:
                # Slow path: has strings/bools/formulas — process individually
                row_strs = strs_np[slot_idx]
                row_list = [None] * (last_col + 1)
                for ci in non_nan_indices:
                    ci = int(ci)
                    if ci > last_col:
                        break
                    v = float(rv[ci])

                    if v == SENTINEL_STRING:
                        ssi = int(row_strs[ci])
                        row_list[ci] = ss[ssi] if ss and 0 <= ssi < len(ss) else None
                    elif v == SENTINEL_FMLA:
                        off = int(foff_np[slot_idx, ci])
                        bl = int(flen_np[slot_idx, ci])
                        if off + bl <= buf_len:
                            row_list[ci] = raw[off:off + bl].decode('utf-16-le', errors='replace')
                        else:
                            row_list[ci] = ""
                    elif v == SENTINEL_BOOL_T:
                        row_list[ci] = True
                    elif v == SENTINEL_BOOL_F:
                        row_list[ci] = False
                    else:
                        row_list[ci] = v

            result[row_num] = row_list

        return result
