/*
 * biff12_parse.c — Fast BIFF12 sheet parser for .xlsb files
 * ============================================================
 * Parses raw binary sheet data from an .xlsb ZIP entry,
 * returning cell values as a flat array for Python to consume.
 * 
 * Compile: gcc -O3 -shared -fPIC -o biff12_parse.so biff12_parse.c -lm
 */

#include <stdint.h>
#include <string.h>
#include <math.h>

/* Record types */
#define RT_ROW       0x0000
#define RT_NUM       0x0002  /* BrtCellRk */
#define RT_FLOAT     0x0005  /* BrtCellReal */
#define RT_STRING    0x0007  /* BrtCellIsst */
#define RT_FMLA_STR  0x0008  /* BrtFmlaString */
#define RT_FMLA_FLOAT 0x0009 /* BrtFmlaNum */
#define RT_BOOL      0x0004  /* BrtCellBool */

/* Output cell types */
#define CELL_EMPTY   0
#define CELL_FLOAT   1
#define CELL_STRING  2  /* shared string index */
#define CELL_BOOL    3
#define CELL_FMLA_STR 4  /* inline formula string — offset+len in raw data */

/* Output cell struct (fixed 24 bytes) */
typedef struct {
    uint32_t row;
    uint32_t col;
    uint8_t  type;
    uint8_t  _pad[3];
    /* For CELL_FLOAT: the double value.
       For CELL_STRING: the shared string index (as double).
       For CELL_BOOL: 0.0 or 1.0.
       For CELL_FMLA_STR: encode offset in upper 32 bits, len in lower 32 bits. */
    double   value;
    /* For CELL_FMLA_STR we also need offset and byte length */
    uint32_t str_offset;  /* byte offset in raw buffer to UTF-16LE string data */
    uint32_t str_bytelen; /* byte length of string data */
} Cell;

static inline double rk_to_float(int32_t rk) {
    double v;
    if (rk & 0x02) {
        v = (double)(rk >> 2);
    } else {
        /* IEEE double with low 32 bits zeroed */
        uint64_t bits = (uint64_t)((uint32_t)(rk & 0xFFFFFFFC)) << 32;
        memcpy(&v, &bits, 8);
    }
    if (rk & 0x01) {
        v /= 100.0;
    }
    return v;
}

/*
 * parse_sheet: Parse a BIFF12 sheet binary buffer.
 *
 * Parameters:
 *   buf        - raw sheet binary data
 *   buf_len    - length of buf
 *   max_row    - stop parsing after this 0-indexed row
 *   out        - pre-allocated output buffer for cells
 *   out_cap    - capacity of out buffer (max cells)
 *   row_mask   - bitmask of rows to include (NULL = all rows up to max_row)
 *                128 bytes = 1024 bits, one bit per row
 *   mask_len   - length of row_mask in bytes (0 if row_mask is NULL)
 *
 * Returns: number of cells written to out.
 */
int parse_sheet(
    const uint8_t *buf,
    uint32_t buf_len,
    uint32_t max_row,
    Cell *out,
    uint32_t out_cap,
    const uint8_t *row_mask,
    uint32_t mask_len
) {
    uint32_t pos = 0;
    uint32_t n_cells = 0;
    uint32_t current_row = 0xFFFFFFFF;
    int emit = 1;  /* whether to emit cells for current_row */

    while (pos < buf_len && n_cells < out_cap) {
        /* Read record type (1 or 2 bytes) */
        if (pos >= buf_len) break;
        uint32_t rt = buf[pos++];
        if (rt & 0x80) {
            if (pos >= buf_len) break;
            rt = (rt & 0x7F) | ((uint32_t)buf[pos++] << 7);
        }

        /* Read record size (1-4 bytes variable encoding) */
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

        uint32_t ds = pos;     /* data start */
        uint32_t dl = sz;      /* data length */
        pos += sz;             /* advance past record */

        if (pos > buf_len) break;  /* truncated record */

        if (rt == RT_ROW) {
            if (dl >= 4) {
                uint32_t row;
                memcpy(&row, buf + ds, 4);
                current_row = row;
                if (current_row > max_row) break;
                /* Check row_mask if provided */
                if (row_mask && mask_len > 0) {
                    uint32_t byte_idx = row >> 3;
                    uint8_t bit_idx = row & 7;
                    emit = (byte_idx < mask_len && (row_mask[byte_idx] & (1 << bit_idx))) ? 1 : 0;
                } else {
                    emit = 1;
                }
            }
        }
        else if (rt == RT_NUM && dl >= 12 && emit && current_row <= max_row) {
            uint32_t col;
            int32_t rk;
            memcpy(&col, buf + ds, 4);
            memcpy(&rk, buf + ds + 8, 4);
            out[n_cells].row = current_row;
            out[n_cells].col = col;
            out[n_cells].type = CELL_FLOAT;
            out[n_cells].value = rk_to_float(rk);
            out[n_cells].str_offset = 0;
            out[n_cells].str_bytelen = 0;
            n_cells++;
        }
        else if (rt == RT_FLOAT && dl >= 16 && emit && current_row <= max_row) {
            uint32_t col;
            double val;
            memcpy(&col, buf + ds, 4);
            memcpy(&val, buf + ds + 8, 8);
            out[n_cells].row = current_row;
            out[n_cells].col = col;
            out[n_cells].type = CELL_FLOAT;
            out[n_cells].value = val;
            out[n_cells].str_offset = 0;
            out[n_cells].str_bytelen = 0;
            n_cells++;
        }
        else if (rt == RT_STRING && dl >= 12 && emit && current_row <= max_row) {
            uint32_t col, ssi;
            memcpy(&col, buf + ds, 4);
            memcpy(&ssi, buf + ds + 8, 4);
            out[n_cells].row = current_row;
            out[n_cells].col = col;
            out[n_cells].type = CELL_STRING;
            out[n_cells].value = (double)ssi;  /* shared string index */
            out[n_cells].str_offset = 0;
            out[n_cells].str_bytelen = 0;
            n_cells++;
        }
        else if (rt == RT_FMLA_STR && dl >= 12 && emit && current_row <= max_row) {
            uint32_t col, str_len;
            memcpy(&col, buf + ds, 4);
            memcpy(&str_len, buf + ds + 8, 4);
            out[n_cells].row = current_row;
            out[n_cells].col = col;
            out[n_cells].type = CELL_FMLA_STR;
            out[n_cells].value = 0.0;
            out[n_cells].str_offset = ds + 12;
            out[n_cells].str_bytelen = str_len * 2;
            n_cells++;
        }
        else if (rt == RT_FMLA_FLOAT && dl >= 16 && emit && current_row <= max_row) {
            uint32_t col;
            double val;
            memcpy(&col, buf + ds, 4);
            memcpy(&val, buf + ds + 8, 8);
            out[n_cells].row = current_row;
            out[n_cells].col = col;
            out[n_cells].type = CELL_FLOAT;
            out[n_cells].value = val;
            out[n_cells].str_offset = 0;
            out[n_cells].str_bytelen = 0;
            n_cells++;
        }
        else if (rt == RT_BOOL && dl >= 9 && emit && current_row <= max_row) {
            uint32_t col;
            memcpy(&col, buf + ds, 4);
            out[n_cells].row = current_row;
            out[n_cells].col = col;
            out[n_cells].type = CELL_BOOL;
            out[n_cells].value = buf[ds + 8] ? 1.0 : 0.0;
            out[n_cells].str_offset = 0;
            out[n_cells].str_bytelen = 0;
            n_cells++;
        }
    }

    return (int)n_cells;
}

/*
 * parse_sst: Parse shared strings table.
 * Returns number of strings found.
 * Writes (offset, byte_length) pairs into out_offsets for each string.
 */
int parse_sst(
    const uint8_t *buf,
    uint32_t buf_len,
    uint32_t *out_offsets,  /* pairs: [offset0, bytelen0, offset1, bytelen1, ...] */
    uint32_t out_cap        /* max strings */
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

        if (rt == 0x0013 && sz >= 5) {  /* BrtSSTItem */
            uint32_t str_len;
            memcpy(&str_len, buf + ds + 1, 4);
            out_offsets[n * 2] = ds + 5;
            out_offsets[n * 2 + 1] = str_len * 2;
            n++;
        }
    }
    return (int)n;
}
