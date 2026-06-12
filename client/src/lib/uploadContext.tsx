import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { API_BASE, queryClient } from "@/lib/queryClient";
import { clearAllCaches, injectFundamentalSheets } from "@/lib/dataService";
import * as XLSX from "xlsx";

export interface UploadJob {
  jobId: string;
  workbookName: string;
  status: "uploading" | "parsing" | "writing" | "complete" | "error";
  progress: { current: number; total: number; ticker: string } | null;
  result: { tickers: number; dates: number; events: number; workbookName: string } | null;
  error: string | null;
  /** Batch upload fields */
  batchTotal?: number | null;
  batchCurrent?: number | null;
  batchWorkbooks?: string[] | null;
  batchResults?: { workbookName: string; tickers: number; status: string }[] | null;
}

export interface UploadedSheet {
  sheetName: string;
  metrics: { name: string; data: { time: string; value: number }[] }[];
  workbook?: string;
}

export interface MergePreviewResult {
  newTickers: string[];
  conflicts: string[];
  totalNew: number;
  totalExisting: number;
  tempPath: string;
  workbookName: string;
  fileSize: number;
}

interface UploadContextType {
  /** Current active upload job, if any */
  activeJob: UploadJob | null;
  /** Start a background upload. Returns immediately after file is sent. */
  startBackgroundUpload: (file: File, mergeMode: "replace" | "merge" | "merge-preview") => Promise<void>;
  /** Start a batch background upload of multiple files. */
  startBatchUpload: (files: File[], mergeMode: "replace" | "merge") => Promise<void>;
  /** Dismiss the completed/errored job notification */
  dismissJob: () => void;
  /** Merge preview result from a completed merge-preview job */
  mergePreviewResult: MergePreviewResult | null;
  /** Clear the merge preview result (after user applies or cancels) */
  clearMergePreview: () => void;
  /** Uploaded fundamental sheets (client-side parsed) */
  fundamentalSheets: UploadedSheet[];
  /** Upload a fundamental workbook (client-side) */
  uploadFundamentalWorkbook: (file: File) => Promise<string>;
  /** Remove a workbook by name */
  removeFundamentalWorkbook: (workbookName: string) => void;
  /** Set sheets directly (for restoring from saved state) */
  setFundamentalSheets: (sheets: UploadedSheet[]) => void;
  /** Serialize fundamental sheets for persistence */
  serializeFundamental: () => UploadedSheet[];
  /** Restore fundamental sheets from persisted state */
  restoreFundamental: (sheets: UploadedSheet[]) => void;
}

const UploadContext = createContext<UploadContextType>({
  activeJob: null,
  startBackgroundUpload: async () => {},
  startBatchUpload: async () => {},
  dismissJob: () => {},
  mergePreviewResult: null,
  clearMergePreview: () => {},
  fundamentalSheets: [],
  uploadFundamentalWorkbook: async () => "",
  removeFundamentalWorkbook: () => {},
  setFundamentalSheets: () => {},
  serializeFundamental: () => [],
  restoreFundamental: () => {},
});

export function useUpload() {
  return useContext(UploadContext);
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const [activeJob, setActiveJob] = useState<UploadJob | null>(null);
  const [mergePreviewResult, setMergePreviewResult] = useState<MergePreviewResult | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Track file metadata for merge-preview jobs */
  const mergePreviewMetaRef = useRef<{ workbookName: string; fileSize: number } | null>(null);

  // Stop polling when component unmounts
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Poll job status
  const notFoundCountRef = useRef(0);
  const startPolling = useCallback((jobId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    notFoundCountRef.current = 0;

    const baseUrl = API_BASE || "";
    pollingRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${baseUrl}/api/data/job/${jobId}`);
        if (!resp.ok) {
          // If server returns 404 repeatedly, the server likely restarted
          // and the job was lost from memory. Show error after 10 consecutive 404s.
          if (resp.status === 404) {
            notFoundCountRef.current++;
            if (notFoundCountRef.current >= 10) {
              if (pollingRef.current) clearInterval(pollingRef.current);
              pollingRef.current = null;
              setActiveJob((prev) =>
                prev && prev.jobId === jobId
                  ? { ...prev, status: "error", error: "Server restarted and lost the upload job. Please try uploading again." }
                  : prev
              );
            }
          }
          return;
        }
        notFoundCountRef.current = 0;
        const data = await resp.json();

        setActiveJob((prev) => {
          if (!prev || prev.jobId !== jobId) return prev;
          return {
            ...prev,
            status: data.status,
            progress: data.progress,
            result: data.result,
            error: data.error,
            batchTotal: data.batchTotal ?? prev.batchTotal,
            batchCurrent: data.batchCurrent ?? prev.batchCurrent,
            batchWorkbooks: data.batchWorkbooks ?? prev.batchWorkbooks,
            batchResults: data.batchResults ?? prev.batchResults,
          };
        });

        // Stop polling when done
        if (data.status === "complete" || data.status === "error") {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;

          // If complete, check for merge preview data
          if (data.status === "complete" && data.mergePreview) {
            const meta = mergePreviewMetaRef.current;
            setMergePreviewResult({
              ...data.mergePreview,
              workbookName: meta?.workbookName || data.result?.workbookName || "",
              fileSize: meta?.fileSize || 0,
            });
            mergePreviewMetaRef.current = null;
          } else if (data.status === "complete") {
            // Non-preview job completed — invalidate caches
            clearAllCaches();
            queryClient.invalidateQueries();
          }
        }
      } catch {
        // Network error — keep polling
      }
    }, 1000);
  }, []);

  const startBackgroundUpload = useCallback(
    async (file: File, mergeMode: "replace" | "merge" | "merge-preview") => {
      // Upload the file to the async endpoint
      const formData = new FormData();
      formData.append("workbook", file);
      formData.append("mergeMode", mergeMode);

      // Track metadata for merge-preview jobs
      if (mergeMode === "merge-preview") {
        mergePreviewMetaRef.current = { workbookName: file.name, fileSize: file.size };
      }

      const job: UploadJob = {
        jobId: "",
        workbookName: file.name,
        status: "uploading",
        progress: null,
        result: null,
        error: null,
      };
      setActiveJob(job);

      try {
        const baseUrl = API_BASE || "";
        const resp = await fetch(`${baseUrl}/api/data/server-parse-async`, {
          method: "POST",
          body: formData,
        });
        const data = await resp.json();

        if (!resp.ok || !data.ok) {
          setActiveJob((prev) =>
            prev
              ? { ...prev, status: "error", error: data.error || "Upload failed" }
              : null
          );
          return;
        }

        // File is uploaded, server is parsing in background
        setActiveJob((prev) =>
          prev
            ? { ...prev, jobId: data.jobId, status: "parsing" }
            : null
        );

        // Start polling for progress
        startPolling(data.jobId);
      } catch (e: any) {
        setActiveJob((prev) =>
          prev
            ? { ...prev, status: "error", error: e.message || "Upload failed" }
            : null
        );
      }
    },
    [startPolling]
  );

  const startBatchUpload = useCallback(
    async (files: File[], mergeMode: "replace" | "merge") => {
      const names = files.map(f => f.name);
      const job: UploadJob = {
        jobId: "",
        workbookName: names.join(", "),
        status: "uploading",
        progress: null,
        result: null,
        error: null,
        batchTotal: files.length,
        batchCurrent: 0,
        batchWorkbooks: names,
        batchResults: [],
      };
      setActiveJob(job);

      try {
        const baseUrl = API_BASE || "";

        // Step 1: Create the batch job (lightweight JSON, no files)
        const createResp = await fetch(`${baseUrl}/api/data/batch-job`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workbookNames: names, mergeMode, batchTotal: files.length }),
        });
        const createData = await createResp.json();
        if (!createResp.ok || !createData.ok) {
          setActiveJob((prev) => prev ? { ...prev, status: "error", error: createData.error || "Failed to create batch job" } : null);
          return;
        }

        const jobId = createData.jobId;
        setActiveJob((prev) => prev ? { ...prev, jobId } : null);

        // Step 2: Upload each file one at a time (sequential to avoid browser OOM)
        for (let i = 0; i < files.length; i++) {
          setActiveJob((prev) => prev ? {
            ...prev,
            batchCurrent: i + 1,
            progress: { current: i + 1, total: files.length, ticker: `Uploading ${files[i].name}...` },
          } : null);

          const formData = new FormData();
          formData.append("workbook", files[i]);

          const fileResp = await fetch(`${baseUrl}/api/data/batch-job/${jobId}/file`, {
            method: "POST",
            body: formData,
          });

          let fileData: any;
          try {
            fileData = await fileResp.json();
          } catch (_) {
            setActiveJob((prev) => prev ? {
              ...prev,
              status: "error",
              error: `Failed to upload ${files[i].name} (server returned status ${fileResp.status})`,
            } : null);
            return;
          }

          if (!fileResp.ok || !fileData.ok) {
            setActiveJob((prev) => prev ? {
              ...prev,
              status: "error",
              error: fileData.error || `Failed to upload ${files[i].name}`,
            } : null);
            return;
          }
        }

        // Step 3: All files uploaded — server auto-starts processing.
        // Switch to parsing state and start polling.
        setActiveJob((prev) => prev ? { ...prev, status: "parsing" } : null);
        startPolling(jobId);
      } catch (e: any) {
        const msg = e.name === "AbortError"
          ? "Upload timed out — try uploading fewer files at once."
          : e.message?.includes("Failed to fetch") || e.message?.includes("NetworkError")
            ? "Network error during upload. Check your connection and try again."
            : e.message || "Batch upload failed";
        setActiveJob((prev) => prev ? { ...prev, status: "error", error: msg } : null);
      }
    },
    [startPolling]
  );

  const dismissJob = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setActiveJob(null);
  }, []);

  const clearMergePreview = useCallback(() => {
    setMergePreviewResult(null);
  }, []);

  // ── Fundamental sheets (client-side parsed) ──
  const [fundamentalSheets, setFundamentalSheetsRaw] = useState<UploadedSheet[]>([]);

  const setFundamentalSheets = useCallback((sheets: UploadedSheet[]) => {
    setFundamentalSheetsRaw(sheets);
    if (sheets.length > 0) injectFundamentalSheets(sheets);
  }, []);

  const uploadFundamentalWorkbook = useCallback(async (file: File): Promise<string> => {
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data, { type: "array", cellDates: true });
    const sheets: UploadedSheet[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws["!ref"]) continue;
      const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "yyyy-mm-dd" });
      if (aoa.length < 2) continue;

      const headerRow = aoa[0];
      const dates: string[] = [];
      for (let c = 1; c < headerRow.length; c++) {
        const raw = headerRow[c];
        if (!raw) { dates.push(""); continue; }
        let dateStr = String(raw).trim();
        // Excel numeric date codes (e.g. 41275)
        if (/^\d{5}$/.test(dateStr)) {
          const d = XLSX.SSF.parse_date_code(parseInt(dateStr));
          dateStr = `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
        }
        // Annual FY format: 2014FY, FY2014 → year-end 12-31
        const fyMatch = dateStr.match(/^(\d{4})\s*FY$/i) || dateStr.match(/^FY\s*(\d{4})$/i);
        if (fyMatch) {
          dateStr = `${fyMatch[1]}-12-31`;
        } else {
          // Quarterly formats: 2013Q2, 2013-Q2, Q2-2013, Q2 2013, 2Q2013, FY2013Q2, etc.
          const qEnd: Record<number, string> = { 1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31" };
          const qMatch = dateStr.match(/^(?:FY)?\s*(\d{4})[\s\-]?Q([1-4])$/i)
            || dateStr.match(/^Q([1-4])[\s\-]?(\d{4})$/i)
            || dateStr.match(/^([1-4])Q(\d{4})$/i);
          if (qMatch) {
            let year: string, q: number;
            if (/^(?:FY)?\s*\d{4}/i.test(dateStr)) {
              year = qMatch[1]; q = parseInt(qMatch[2]);
            } else if (/^Q/i.test(dateStr)) {
              q = parseInt(qMatch[1]); year = qMatch[2];
            } else {
              q = parseInt(qMatch[1]); year = qMatch[2];
            }
            dateStr = `${year}-${qEnd[q]}`;
          } else {
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              dateStr = parsed.toISOString().slice(0, 10);
            }
          }
        }
        dates.push(dateStr);
      }

      const metrics: UploadedSheet["metrics"] = [];
      for (let r = 1; r < aoa.length; r++) {
        const row = aoa[r];
        const metricName = String(row[0] || "").trim();
        if (!metricName) continue;
        // Skip known header/meta rows that aren't actual metrics
        const skipLabels = new Set(["calendar", "fiscal", "fiscal date", "fiscal quarter", "period", "unit", "source", "tag id"]);
        if (skipLabels.has(metricName.toLowerCase())) continue;
        const timeSeries: { time: string; value: number }[] = [];
        for (let c = 1; c < row.length && c - 1 < dates.length; c++) {
          const dateStr = dates[c - 1];
          if (!dateStr) continue;
          const rawVal = row[c];
          const val = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal || "").replace(/[,%$]/g, ""));
          if (!isNaN(val) && isFinite(val)) {
            timeSeries.push({ time: dateStr, value: val });
          }
        }
        if (timeSeries.length > 0) {
          timeSeries.sort((a, b) => a.time.localeCompare(b.time));
          metrics.push({ name: metricName, data: timeSeries });
        }
      }
      if (metrics.length > 0) {
        // Strip common exchange suffixes (e.g. PSA-US → PSA) so ticker names match main data
        const cleanName = sheetName.replace(/-US$/i, "").toUpperCase();
        sheets.push({ sheetName: cleanName, metrics, workbook: file.name });
      }
    }

    // Track skipped sheets for user feedback
    const skippedSheets = wb.SheetNames.filter(sn => !sheets.some(s => s.sheetName === sn.replace(/-US$/i, "").toUpperCase()));

    if (sheets.length === 0) {
      const reason = skippedSheets.length > 0
        ? `All ${skippedSheets.length} sheets were empty or had no parseable data: ${skippedSheets.join(", ")}`
        : "No valid data found in workbook.";
      throw new Error(reason);
    }

    // Merge with existing sheets (replace sheets from same workbook)
    setFundamentalSheetsRaw(prev => {
      const kept = prev.filter(s => s.workbook !== file.name);
      const merged = [...kept, ...sheets];
      injectFundamentalSheets(merged);
      return merged;
    });

    const totalMetrics = sheets.reduce((s, sh) => s + sh.metrics.length, 0);
    let msg = `Loaded ${sheets.length} sheet${sheets.length > 1 ? "s" : ""} (${sheets.map(s => s.sheetName).join(", ")}), ${totalMetrics} metrics total.`;
    if (skippedSheets.length > 0) {
      msg += ` Skipped ${skippedSheets.length} empty sheet${skippedSheets.length > 1 ? "s" : ""}: ${skippedSheets.join(", ")}.`;
    }
    return msg;
  }, []);

  const removeFundamentalWorkbook = useCallback((workbookName: string) => {
    setFundamentalSheetsRaw(prev => {
      const kept = prev.filter(s => s.workbook !== workbookName);
      // Re-inject only kept sheets
      injectFundamentalSheets(kept);
      return kept;
    });
  }, []);

  // Serialize/restore for autosave persistence
  const serializeFundamental = useCallback(() => fundamentalSheets, [fundamentalSheets]);
  const restoreFundamental = useCallback((sheets: UploadedSheet[]) => {
    if (!sheets || sheets.length === 0) return;
    setFundamentalSheetsRaw(sheets);
    injectFundamentalSheets(sheets);
  }, []);

  return (
    <UploadContext.Provider value={{
      activeJob, startBackgroundUpload, startBatchUpload, dismissJob, mergePreviewResult, clearMergePreview,
      fundamentalSheets, uploadFundamentalWorkbook, removeFundamentalWorkbook, setFundamentalSheets,
      serializeFundamental, restoreFundamental,
    }}>
      {children}
    </UploadContext.Provider>
  );
}
