/*
 * biff12_fast.c — Optimized BIFF12 sheet parser returning row-major float array
 * ===============================================================================
 * Instead of returning individual cells, outputs a dense (n_rows x n_cols) double
 * array. String cells get NaN, their SSI is stored in a separate int array.
 * This avoids 26M Python object creations.
 *
 * Compile: gcc -O3 -shared -fPIC -o biff12_fast.so biff12_fast.c -lm
 */

#include <stdint.h>
#include <string.h>
#include <math.h>

/* Record types */
#define RT_ROW        0x0000
#define RT_NUM        0x0002
#define RT_FLOAT      0x0005
#define RT_STRING     0x0007
#define RT_FMLA_STR   0x0008
#define RT_FMLA_FLOAT 0x0009
#define RT_BOOL       0x0004
#define RT_SST_ITEM   0x0013

/* Sentinel values for non-float cells (use specific negative values) */
#define SENTINEL_STRING  -9.999e200
#define SENTINEL_FMLA    -9.998e200
#define SENTINEL_BOOL_T  -9.997e200
#define SENTINEL_BOOL_F  -9.996e200

static inline double rk_to_float(int32_t rk) {
    double v;
    if (rk & 0x02) {
        v = (double)(rk >> 2);
    } else {
        uint64_t bits = (uint64_t)((uint32_t)(rk & 0xFFFFFFFC)) << 32;
        memcpy(&v, &bits, 8);
    }
    if (rk & 0x01) v /= 100.0;
    return v;
}

/*
 * parse_sheet_dense: Parse a BIFF12 sheet into a dense row-keyed format.
 *
 * For each needed row, writes cell values into:
 *   values[slot * max_cols + col] = double value (NaN for empty/missing)
 *   strings[slot * max_cols + col] = SSI index (-1 if not a string)
 *
 * Parameters:
 *   buf, buf_len   - raw sheet binary data
 *   row_slots      - maps 0-indexed row numbers to output slot indices
 *                    row_slots[row] = slot index, or -1 if not needed
 *   n_row_slots    - length of row_slots array (>= max_row+1)
 *   max_row        - stop after this row
 *   max_cols       - width of output arrays
 *   values         - output: n_slots * max_cols doubles, pre-filled with NaN
 *   strings        - output: n_slots * max_cols int32s, pre-filled with -1
 *   fmla_offsets   - output: n_slots * max_cols uint32s for formula string offsets (0 = none)
 *   fmla_lengths   - output: n_slots * max_cols uint32s for formula string byte lengths
 *
 * Returns: total number of cells written.
 */
int parse_sheet_dense(
    const uint8_t *buf,
    uint32_t buf_len,
    const int32_t *row_slots,
    uint32_t n_row_slots,
    uint32_t max_row,
    uint32_t max_cols,
    double *values,
    int32_t *strings,
    uint32_t *fmla_offsets,
    uint32_t *fmla_lengths
) {
    uint32_t pos = 0;
    uint32_t n_cells = 0;
    uint32_t current_row = 0xFFFFFFFF;
    int32_t current_slot = -1;

    while (pos < buf_len) {
        if (pos >= buf_len) break;
        uint32_t rt = buf[pos++];
        if (rt & 0x80) {
            if (pos >= buf_len) break;
            rt = (rt & 0x7F) | ((uint32_t)buf[pos++] << 7);
        }
        if (pos >= buf_len) break;
        uint32_t sz = buf[pos++];
        if (sz & 0x80) {
            if (pos >= buf_len) break;
            sz = (sz & 0x7F) | (((uint32_t)buf[pos++] & 0x7F) << 7);
            if (sz & (1u << 14)) {
                if (pos >= buf_len) break;
                sz = (sz & 0x3FFF) | (((uint32_t)buf[pos++] & 0x7F) << 14);
                if (sz & (1u << 21)) {
                    if (pos >= buf_len) break;
                    sz = (sz & 0x1FFFFF) | ((uint32_t)buf[pos++] << 21);
                }
            }
        }
        uint32_t ds = pos;
        uint32_t dl = sz;
        pos += sz;
        if (pos > buf_len) break;

        if (rt == RT_ROW && dl >= 4) {
            uint32_t row;
            memcpy(&row, buf + ds, 4);
            current_row = row;
            if (current_row > max_row) break;
            current_slot = (current_row < n_row_slots) ? row_slots[current_row] : -1;
        }
        else if (current_slot < 0) {
            continue;  /* Skip cells for unneeded rows — fast path */
        }
        else if (rt == RT_NUM && dl >= 12) {
            uint32_t col;
            memcpy(&col, buf + ds, 4);
            if (col < max_cols) {
                int32_t rk;
                memcpy(&rk, buf + ds + 8, 4);
                uint32_t idx = (uint32_t)current_slot * max_cols + col;
                values[idx] = rk_to_float(rk);
                n_cells++;
            }
        }
        else if (rt == RT_FLOAT && dl >= 16) {
            uint32_t col;
            memcpy(&col, buf + ds, 4);
            if (col < max_cols) {
                double val;
                memcpy(&val, buf + ds + 8, 8);
                uint32_t idx = (uint32_t)current_slot * max_cols + col;
                values[idx] = val;
                n_cells++;
            }
        }
        else if (rt == RT_STRING && dl >= 12) {
            uint32_t col;
            memcpy(&col, buf + ds, 4);
            if (col < max_cols) {
                uint32_t ssi;
                memcpy(&ssi, buf + ds + 8, 4);
                uint32_t idx = (uint32_t)current_slot * max_cols + col;
                strings[idx] = (int32_t)ssi;
                values[idx] = SENTINEL_STRING;
                n_cells++;
            }
        }
        else if (rt == RT_FMLA_STR && dl >= 12) {
            uint32_t col;
            memcpy(&col, buf + ds, 4);
            if (col < max_cols) {
                uint32_t str_len;
                memcpy(&str_len, buf + ds + 8, 4);
                uint32_t idx = (uint32_t)current_slot * max_cols + col;
                values[idx] = SENTINEL_FMLA;
                fmla_offsets[idx] = ds + 12;
                fmla_lengths[idx] = str_len * 2;
                n_cells++;
            }
        }
        else if (rt == RT_FMLA_FLOAT && dl >= 16) {
            uint32_t col;
            memcpy(&col, buf + ds, 4);
            if (col < max_cols) {
                double val;
                memcpy(&val, buf + ds + 8, 8);
                uint32_t idx = (uint32_t)current_slot * max_cols + col;
                values[idx] = val;
                n_cells++;
            }
        }
        else if (rt == RT_BOOL && dl >= 9) {
            uint32_t col;
            memcpy(&col, buf + ds, 4);
            if (col < max_cols) {
                uint32_t idx = (uint32_t)current_slot * max_cols + col;
                values[idx] = buf[ds + 8] ? SENTINEL_BOOL_T : SENTINEL_BOOL_F;
                n_cells++;
            }
        }
    }

    return (int)n_cells;
}

/* Keep the SST parser from before */
int parse_sst(
    const uint8_t *buf,
    uint32_t buf_len,
    uint32_t *out_offsets,
    uint32_t out_cap
) {
    uint32_t pos = 0;
    uint32_t n = 0;
    while (pos < buf_len && n < out_cap) {
        if (pos >= buf_len) break;
        uint32_t rt = buf[pos++];
        if (rt & 0x80) {
            if (pos >= buf_len) break;
            rt = (rt & 0x7F) | ((uint32_t)buf[pos++] << 7);
        }
        if (pos >= buf_len) break;
        uint32_t sz = buf[pos++];
        if (sz & 0x80) {
            if (pos >= buf_len) break;
            sz = (sz & 0x7F) | (((uint32_t)buf[pos++] & 0x7F) << 7);
            if (sz & (1u << 14)) {
                if (pos >= buf_len) break;
                sz = (sz & 0x3FFF) | (((uint32_t)buf[pos++] & 0x7F) << 14);
                if (sz & (1u << 21)) {
                    if (pos >= buf_len) break;
                    sz = (sz & 0x1FFFFF) | ((uint32_t)buf[pos++] << 21);
                }
            }
        }
        uint32_t ds = pos;
        pos += sz;
        if (pos > buf_len) break;
        if (rt == 0x0013 && sz >= 5) {
            uint32_t str_len;
            memcpy(&str_len, buf + ds + 1, 4);
            out_offsets[n * 2] = ds + 5;
            out_offsets[n * 2 + 1] = str_len * 2;
            n++;
        }
    }
    return (int)n;
}
