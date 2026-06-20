import { useState, useRef, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Database, Upload, CheckCircle2, AlertCircle, Loader2, GitMerge, Replace, ArrowRight, Check, X, ChevronDown, ChevronRight, FileSpreadsheet, Search, Clock, Trash2 } from "lucide-react";
import { apiRequest, API_BASE, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { parseExcelClientSide, rleToTuples, type ParseProgress, type ParsedWorkbook } from "@/lib/excelParser";
import { injectTickers, injectDates, injectEvents, injectTickerData, clearTickerDataCache, clearAllCaches, getTickersCacheSync } from "@/lib/dataService";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useUpload, type UploadedSheet } from "@/lib/uploadContext";

interface DataStatus {
  tickers: number;
  dates: number;
  lastDate: string | null;
  lastUpdated: string;
}

interface PreviewResult {
  newTickers: string[];
  conflicts: string[];
  totalNew: number;
  totalExisting: number;
  newEventTickers: number;
  tempDir: string;
}

interface SourceInfo {
  workbook: string;
  uploadedAt: string;
  dates: number;
  metrics: number;
  fileSize: number;
}

interface WorkbookSummary {
  name: string;
  uploadedAt: string;
  tickers: string[];
  totalSize: number;
}

interface SourcesData {
  sources: Record<string, SourceInfo>;
  workbooks: WorkbookSummary[];
}

type UploadMode = "replace" | "merge";
type ConflictStep = "idle" | "uploading" | "preview" | "resolving" | "merging" | "done";

export default function DataManager() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<DataStatus | null>(null);
  const [loading, setLoading] = useState(false);

  // Replace mode
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Merge mode
  const [mergeStep, setMergeStep] = useState<ConflictStep>("idle");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, "overwrite" | "keep">>({});
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const [uploadMode, setUploadMode] = useState<UploadMode>("merge");

  // Sources audit
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourcesData, setSourcesData] = useState<SourcesData | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesFilter, setSourcesFilter] = useState("");
  const [expandedWorkbooks, setExpandedWorkbooks] = useState<Set<string>>(new Set());

  // Parsing progress (client-side or server-side)
  const [parseProgress, setParseProgress] = useState<ParseProgress | null>(null);

  // Wipe state
  const [wipeConfirm, setWipeConfirm] = useState(false);
  const [wiping, setWiping] = useState(false);

  // Per-workbook wipe state
  const [wipeWorkbookName, setWipeWorkbookName] = useState<string | null>(null);
  const [wipingWorkbook, setWipingWorkbook] = useState(false);

  // Cap rate upload state
  const [capRateUploading, setCapRateUploading] = useState(false);
  const [capRateResult, setCapRateResult] = useState<string | null>(null);
  const [capRateError, setCapRateError] = useState<string | null>(null);
  const [capRateConfirmRemove, setCapRateConfirmRemove] = useState(false);
  const [capRateRemoving, setCapRateRemoving] = useState(false);
  const capRateFileRef = useRef<HTMLInputElement>(null);
  const [capRateMeta, setCapRateMeta] = useState<{
    loaded: boolean;
    workbook?: string;
    uploadedAt?: string;
    tickersUpdated?: number;
    totalPoints?: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mergeFileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { startBackgroundUpload, startBatchUpload, activeJob, mergePreviewResult, clearMergePreview } = useUpload();

  // Check if backend API is reachable (vs static-only deployment)
  const backendAvailable = useRef<boolean | null>(null);
  const checkBackend = useCallback(async (): Promise<boolean> => {
    if (backendAvailable.current !== null) return backendAvailable.current;
    try {
      const resp = await apiRequest("GET", "/api/data/status");
      const data = await resp.json();
      // Verify it's actually a valid API response (not an HTML error page)
      if (data && typeof data.tickers === "number") {
        backendAvailable.current = true;
        return true;
      }
    } catch {}
    backendAvailable.current = false;
    return false;
  }, []);

  // Helper: try server-side parse first (for large files), fall back to client-side
  const parseWorkbook = useCallback(async (
    file: File,
    onProgress: (p: ParseProgress) => void,
  ): Promise<ParsedWorkbook> => {
    const hasBackend = await checkBackend();
    if (hasBackend) {
      try {
        onProgress({ phase: "reading", current: 0, total: 1, message: `Uploading ${file.name} to server for parsing...` });
        const formData = new FormData();
        formData.append("workbook", file);
        const baseUrl = API_BASE || "";
        const resp = await fetch(`${baseUrl}/api/data/server-parse`, {
          method: "POST",
          body: formData,
        });
        if (resp.ok) {
          onProgress({ phase: "done", current: 1, total: 1, message: "Server parsing complete, loading results..." });
          const data = await resp.json();
          if (data.ok && data.tickers && data.dates) {
            console.log(`[server-parse] Received ${data.tickers.length} tickers, ${data.dates.length} dates`);
            return {
              tickers: data.tickers,
              dates: data.dates,
              events: data.events || {},
              tickerData: data.tickerData || {},
              workbookName: data.workbookName || file.name,
            };
          }
        }
        console.warn("Server-side parse returned non-ok, falling back to client-side");
      } catch (serverErr) {
        console.warn("Server-side parse failed, falling back to client-side:", serverErr);
      }
    }
    return parseExcelClientSide(file, onProgress);
  }, [checkBackend]);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const hasBackend = await checkBackend();
      if (hasBackend) {
        const resp = await apiRequest("GET", "/api/data/status");
        const data = await resp.json();
        setStatus(data);
      } else {
        // Static mode: derive status from static data files
        const [tickersResp, datesResp] = await Promise.all([
          fetch("data/tickers.json"),
          fetch("data/dates.json"),
        ]);
        const tickers = await tickersResp.json();
        const dates = await datesResp.json();
        setStatus({
          tickers: tickers.length,
          dates: dates.length,
          lastDate: dates.length > 0 ? dates[dates.length - 1] : null,
          lastUpdated: new Date().toISOString(),
        });
      }
    } catch (e: any) {
      console.error("Failed to fetch data status", e);
    } finally {
      setLoading(false);
    }
  }, [checkBackend]);

  const fetchSources = useCallback(async () => {
    try {
      setSourcesLoading(true);
      const hasBackend = await checkBackend();
      if (hasBackend) {
        const resp = await apiRequest("GET", "/api/data/sources");
        const data = await resp.json();
        setSourcesData(data);
      } else {
        // Static mode: try to load sources.json from static data
        const resp = await fetch("data/sources.json");
        if (resp.ok) {
          const sources = await resp.json();
          // Aggregate by workbook (same logic as server)
          const wbMap: Record<string, { name: string; uploadedAt: string; tickers: string[]; totalSize: number }> = {};
          for (const [ticker, info] of Object.entries(sources) as [string, any][]) {
            const wb = info.workbook || "unknown";
            if (!wbMap[wb]) {
              wbMap[wb] = { name: wb, uploadedAt: info.uploadedAt, tickers: [], totalSize: 0 };
            }
            wbMap[wb].tickers.push(ticker);
            wbMap[wb].totalSize += info.fileSize || 0;
            if (info.uploadedAt < wbMap[wb].uploadedAt) {
              wbMap[wb].uploadedAt = info.uploadedAt;
            }
          }
          const workbooks = Object.values(wbMap).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
          setSourcesData({ sources, workbooks });
        } else {
          setSourcesData({ sources: {}, workbooks: [] });
        }
      }
    } catch (e: any) {
      console.error("Failed to fetch sources", e);
    } finally {
      setSourcesLoading(false);
    }
  }, [checkBackend]);

  const fetchCapRateMeta = useCallback(async () => {
    try {
      const hasBackend = await checkBackend();
      if (hasBackend) {
        const resp = await apiRequest("GET", "/api/data/caprate-meta");
        const data = await resp.json();
        setCapRateMeta(data);
      }
    } catch {
      // Ignore
    }
  }, [checkBackend]);

  const toggleWorkbook = (name: string) => {
    setExpandedWorkbooks(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit",
      });
    } catch { return iso; }
  };

  const STALE_DAYS = 10;

  const isStale = (iso: string) => {
    try {
      const uploaded = new Date(iso).getTime();
      const now = Date.now();
      return (now - uploaded) / (1000 * 60 * 60 * 24) > STALE_DAYS;
    } catch { return false; }
  };

  const daysAgo = (iso: string) => {
    try {
      const uploaded = new Date(iso).getTime();
      return Math.floor((Date.now() - uploaded) / (1000 * 60 * 60 * 24));
    } catch { return 0; }
  };

  const resetState = () => {
    setUploadResult(null);
    setUploadError(null);
    setMergeStep("idle");
    setPreview(null);
    setResolutions({});
    setMergeResult(null);
    setMergeError(null);
    setWipeConfirm(false);
    setWipeWorkbookName(null);
    serverTempPathRef.current = null;
    parsedWorkbookRef.current = null;
    mergeFileRef.current = null;
  };

  // ── Cap rate workbook upload (client-side parsing) ──
  const handleCapRateUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setCapRateUploading(true);
    setCapRateResult(null);
    setCapRateError(null);
    try {
      const XLSX = await import("xlsx");
      const { getDates, getTickers, getTickerRaw, injectTickerData, injectTickers } = await import("@/lib/dataService");

      // Load dates array for index mapping (shared across all files)
      const datesList = await getDates();
      const dateToIdx = new Map<string, number>();
      datesList.forEach((d, i) => dateToIdx.set(d, i));
      const sortedDates = [...dateToIdx.keys()].sort();

      // Nearest-date binary search (weekly cap rate dates may not align with daily dates)
      function findNearestIdx(target: string): number {
        if (dateToIdx.has(target)) return dateToIdx.get(target)!;
        let lo = 0, hi = sortedDates.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (sortedDates[mid] < target) lo = mid + 1;
          else hi = mid;
        }
        let best = lo;
        if (lo > 0) {
          const dLo = Math.abs(new Date(sortedDates[lo]).getTime() - new Date(target).getTime());
          const dPrev = Math.abs(new Date(sortedDates[lo - 1]).getTime() - new Date(target).getTime());
          if (dPrev < dLo) best = lo - 1;
        }
        return dateToIdx.get(sortedDates[best])!;
      }

      // Known non-ticker sheets to skip
      const NON_TICKER = new Set([
        '__FDSCACHE__', 'FFO multiples ', 'Correlation Analysis', 'Rolling Corr Charts',
        'NW Calc', 'Summary', 'FactSet Prices', 'FS Shares', 'FS Net Debt', 'FS NOI',
        'Spread Charts', 'Acq Cap Rate', 'Cost of Debt', 'Earnings Dates',
        '10Yr Yield', 'Cap Rate vs 10Yr', 'Spread Charts 10Yr'
      ]);

      // Load existing tickers metadata (shared across all files, updated incrementally)
      const tickersMeta = await getTickers();
      const existingTickers = new Set(tickersMeta.map(t => t.ticker));
      const updatedTickersMeta = [...tickersMeta];

      let totalUpdated = 0, totalSkippedNoFile = 0, totalSkippedNoData = 0, grandTotalPoints = 0;
      const fileResults: string[] = [];
      const fileErrors: string[] = [];

      for (const file of files) {
        try {
          const buf = await file.arrayBuffer();
          const wb = XLSX.read(buf, { type: "array", cellDates: true });

          const tickerSheets = wb.SheetNames.filter(s =>
            !NON_TICKER.has(s) && s.replace(/\./g, '').toUpperCase() === s.replace(/\./g, '') && s.length >= 1 && s.length <= 5
          );

          let updated = 0, skippedNoFile = 0, skippedNoData = 0, totalPoints = 0;

          for (const sheetName of tickerSheets) {
            if (!existingTickers.has(sheetName)) {
              skippedNoFile++;
              continue;
            }

            const ws = wb.Sheets[sheetName];
            if (!ws) continue;

            const capRatePoints: [string, number][] = [];
            for (let r = 5; r <= 280; r++) {
              const dateCell = ws[XLSX.utils.encode_cell({ r: r - 1, c: 0 })];
              const crCell = ws[XLSX.utils.encode_cell({ r: r - 1, c: 7 })];
              if (!dateCell || !crCell) continue;

              let dateStr: string | null = null;
              if (dateCell.t === 'd' && dateCell.v instanceof Date) {
                dateStr = dateCell.v.toISOString().slice(0, 10);
              } else if (dateCell.t === 'n' && typeof dateCell.v === 'number') {
                const d = XLSX.SSF.parse_date_code(dateCell.v);
                if (d) dateStr = `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
              } else if (dateCell.t === 's' && typeof dateCell.v === 'string') {
                const parsed = new Date(dateCell.v);
                if (!isNaN(parsed.getTime())) dateStr = parsed.toISOString().slice(0, 10);
              }
              if (!dateStr) continue;

              const crVal = typeof crCell.v === 'number' ? crCell.v : parseFloat(crCell.v);
              if (isNaN(crVal) || !isFinite(crVal)) continue;
              capRatePoints.push([dateStr, crVal]);
            }

            if (capRatePoints.length === 0) { skippedNoData++; continue; }

            const tuples: [number, number][] = [];
            for (const [dateStr, val] of capRatePoints) {
              const idx = findNearestIdx(dateStr);
              if (idx >= 0 && idx < datesList.length) {
                tuples.push([idx, Math.round(val * 100 * 10000) / 10000]);
              }
            }

            if (tuples.length === 0) { skippedNoData++; continue; }
            tuples.sort((a, b) => a[0] - b[0]);

            const existingData = await getTickerRaw(sheetName);
            existingData["Implied Cap Rate"] = tuples;
            injectTickerData(sheetName, existingData);

            const metaEntry = updatedTickersMeta.find(t => t.ticker === sheetName);
            if (metaEntry && !metaEntry.metrics.includes("Implied Cap Rate")) {
              metaEntry.metrics.push("Implied Cap Rate");
            }

            updated++;
            totalPoints += tuples.length;
          }

          totalUpdated += updated;
          totalSkippedNoFile += skippedNoFile;
          totalSkippedNoData += skippedNoData;
          grandTotalPoints += totalPoints;

          if (updated > 0) {
            fileResults.push(`${file.name}: ${updated} tickers, ${totalPoints.toLocaleString()} pts`);
          }

          // Persist cap rate metadata to server per file
          try {
            const hasBackend = await checkBackend();
            if (hasBackend) {
              await apiRequest("POST", "/api/data/caprate-meta", {
                workbook: file.name,
                tickersUpdated: updated,
                totalPoints,
              });
            }
          } catch {
            // Non-critical
          }
        } catch (fileErr: any) {
          fileErrors.push(`${file.name}: ${fileErr.message || "Parse failed"}`);
        }
      }

      // Re-inject updated tickers metadata once after all files
      injectTickers(updatedTickersMeta, "replace");
      fetchCapRateMeta();

      const summary = `Updated ${totalUpdated} tickers with ${grandTotalPoints.toLocaleString()} cap rate data points across ${files.length} file(s).` +
        (totalSkippedNoFile ? ` ${totalSkippedNoFile} skipped (no ticker file).` : "") +
        (totalSkippedNoData ? ` ${totalSkippedNoData} skipped (no data).` : "");
      setCapRateResult(summary);
      toast({ title: "Cap rate data updated", description: `${totalUpdated} tickers updated from ${files.length} file(s)` });

      if (fileErrors.length > 0) {
        setCapRateError(fileErrors.join(" | "));
      }
    } catch (err: any) {
      setCapRateError(err.message || "Upload failed");
    } finally {
      setCapRateUploading(false);
      if (capRateFileRef.current) capRateFileRef.current.value = "";
    }
  }, [toast]);

  const handleWipe = useCallback(async () => {
    setWiping(true);
    try {
      const hasBackend = await checkBackend();
      if (!hasBackend) {
        toast({ title: "Wipe unavailable", description: "Data wipe requires a live backend server. Upload a new workbook to replace data.", variant: "destructive" });
        setWipeConfirm(false);
        return;
      }
      const resp = await apiRequest("POST", "/api/data/wipe");
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Wipe failed", description: data.error || "Unknown error", variant: "destructive" });
      } else {
        toast({ title: "Data wiped", description: "All ticker data has been removed." });
        fetchStatus();
        setSourcesData(null);
        setWipeConfirm(false);
      }
    } catch (err: any) {
      toast({ title: "Wipe failed", description: err.message || "Network error", variant: "destructive" });
    } finally {
      setWiping(false);
    }
  }, [fetchStatus, toast, checkBackend]);

  const handleWipeWorkbook = useCallback(async (workbookName: string) => {
    setWipingWorkbook(true);
    try {
      const hasBackend = await checkBackend();
      if (!hasBackend) {
        toast({ title: "Remove unavailable", description: "Removing a workbook requires a live backend server.", variant: "destructive" });
        setWipeWorkbookName(null);
        return;
      }
      const resp = await apiRequest("POST", "/api/data/wipe-workbook", { workbookName });
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Remove failed", description: data.error || "Unknown error", variant: "destructive" });
      } else {
        toast({ title: "Workbook removed", description: `Removed ${data.removed} ticker${data.removed !== 1 ? "s" : ""} from "${workbookName}". ${data.remaining} ticker${data.remaining !== 1 ? "s" : ""} remaining.` });
        fetchStatus();
        // Refresh sources data
        fetchSources();
        clearAllCaches();
        queryClient.invalidateQueries();
        setWipeWorkbookName(null);
      }
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message || "Network error", variant: "destructive" });
    } finally {
      setWipingWorkbook(false);
    }
  }, [fetchStatus, fetchSources, toast, checkBackend]);

  const handleRemoveCapRate = useCallback(async () => {
    setCapRateRemoving(true);
    try {
      const hasBackend = await checkBackend();
      if (!hasBackend) {
        toast({ title: "Remove unavailable", description: "Removing cap rate data requires a live backend server.", variant: "destructive" });
        setCapRateConfirmRemove(false);
        return;
      }
      const resp = await apiRequest("POST", "/api/data/wipe-caprate");
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: "Remove failed", description: data.error || "Unknown error", variant: "destructive" });
      } else {
        toast({ title: "Cap rate data removed", description: `Stripped Implied Cap Rate from ${data.strippedFiles} ticker file(s).` });
        fetchCapRateMeta();
        fetchStatus();
        fetchSources();
        clearAllCaches();
        queryClient.invalidateQueries();
        setCapRateConfirmRemove(false);
      }
    } catch (err: any) {
      toast({ title: "Remove failed", description: err.message || "Network error", variant: "destructive" });
    } finally {
      setCapRateRemoving(false);
    }
  }, [fetchCapRateMeta, fetchStatus, fetchSources, toast, checkBackend]);

  const handleOpen = (isOpen: boolean) => {
    // Don't allow closing if a merge apply is in progress
    if (!isOpen && mergeStep === "merging") {
      toast({ title: "Please wait", description: "Merge is being applied — this will only take a moment." });
      return;
    }
    setOpen(isOpen);
    if (isOpen) {
      fetchStatus();
      fetchCapRateMeta();
      // If a background merge-preview completed, populate the preview UI
      if (mergePreviewResult) {
        setUploadMode("merge");
        setPreview({
          newTickers: mergePreviewResult.newTickers,
          conflicts: mergePreviewResult.conflicts,
          totalNew: mergePreviewResult.totalNew,
          totalExisting: mergePreviewResult.totalExisting,
          newEventTickers: 0,
          tempDir: "__server_parsed__",
        });
        serverTempPathRef.current = mergePreviewResult.tempPath;
        mergeWorkbookNameRef.current = mergePreviewResult.workbookName;
        mergeFileSizeRef.current = mergePreviewResult.fileSize;
        const defaultRes: Record<string, "overwrite" | "keep"> = {};
        for (const ticker of mergePreviewResult.conflicts) {
          defaultRes[ticker] = "keep";
        }
        setResolutions(defaultRes);
        setMergeStep(mergePreviewResult.conflicts.length > 0 ? "resolving" : "preview");
        setMergeResult(null);
        setMergeError(null);
        clearMergePreview();
      } else {
        resetState();
      }
    }
  };

  // Helper: inject parsed data directly into client caches (static mode fallback)
  const injectParsedIntoClientCache = useCallback((
    parsed: ParsedWorkbook,
    mode: "replace" | "merge",
  ) => {
    if (mode === "replace") {
      clearTickerDataCache();
    }

    // Inject ticker data (convert RLE → tuple format)
    for (const [ticker, rleData] of Object.entries(parsed.tickerData)) {
      const tuples = rleToTuples(rleData);
      injectTickerData(ticker, tuples);
    }

    // Inject metadata (pass mode so merge properly unions)
    injectDates(parsed.dates, mode);
    injectEvents(parsed.events, mode);
    injectTickers(parsed.tickers, mode);

    // Invalidate ALL React Query caches so every component re-fetches from
    // the now-updated dataService caches instead of showing stale data.
    queryClient.invalidateQueries();
  }, []);

  // Helper: send parsed data to backend using chunked protocol
  const sendParsedToBackend = useCallback(async (
    parsed: import("@/lib/excelParser").ParsedWorkbook,
    mode: "replace" | "merge",
  ): Promise<{ ok: boolean; tickers: number; dates: number; events: number; error?: string }> => {
    // Step 1: Start ingest session
    const startResp = await apiRequest("POST", "/api/data/ingest/start", {
      mode,
      workbookName: parsed.workbookName,
      dates: parsed.dates,
      events: parsed.events,
    });
    if (!startResp.ok) {
      const err = await startResp.json();
      throw new Error(err.error || "Failed to start ingest");
    }

    // Step 2: Send ticker data in chunks of ~20 tickers each
    const CHUNK_SIZE = 20;
    const tickerKeys = Object.keys(parsed.tickerData);
    for (let i = 0; i < tickerKeys.length; i += CHUNK_SIZE) {
      const chunkKeys = tickerKeys.slice(i, i + CHUNK_SIZE);
      const chunkData: Record<string, Record<string, (number | string)[]>> = {};
      const chunkTickers: typeof parsed.tickers = [];

      for (const key of chunkKeys) {
        chunkData[key] = parsed.tickerData[key];
        const meta = parsed.tickers.find(t => t.ticker === key);
        if (meta) chunkTickers.push(meta);
      }

      setParseProgress({
        phase: "done",
        current: Math.min(i + CHUNK_SIZE, tickerKeys.length),
        total: tickerKeys.length,
        message: `Sending ${Math.min(i + CHUNK_SIZE, tickerKeys.length)}/${tickerKeys.length} tickers...`,
      });

      const chunkResp = await apiRequest("POST", "/api/data/ingest/chunk", {
        tickers: chunkTickers,
        tickerData: chunkData,
      });
      if (!chunkResp.ok) {
        const err = await chunkResp.json();
        throw new Error(err.error || `Failed at chunk ${i}`);
      }
    }

    // Step 3: Finish
    setParseProgress({ phase: "done", current: 0, total: 0, message: "Finalizing..." });
    const finishResp = await apiRequest("POST", "/api/data/ingest/finish");
    const result = await finishResp.json();
    if (!finishResp.ok) {
      throw new Error(result.error || "Failed to finalize ingest");
    }
    return result;
  }, []);

  // Helper: upload file to server-parse endpoint with form data
  const serverParseUpload = useCallback(async (
    file: File,
    mode: string,
    mergeMode?: string,
    resolutions?: Record<string, string>,
  ): Promise<Response> => {
    const formData = new FormData();
    formData.append("workbook", file);
    formData.append("mode", mode);
    if (mergeMode) formData.append("mergeMode", mergeMode);
    if (resolutions) formData.append("resolutions", JSON.stringify(resolutions));
    const baseUrl = API_BASE || "";
    return fetch(`${baseUrl}/api/data/server-parse`, {
      method: "POST",
      body: formData,
    });
  }, []);

  // Helper: poll parse progress from server while upload/parse is running
  const startProgressPolling = useCallback((abortSignal: AbortSignal) => {
    const baseUrl = API_BASE || "";
    const poll = () => {
      if (abortSignal.aborted) return;
      fetch(`${baseUrl}/api/data/parse-progress`)
        .then(r => r.json())
        .then(data => {
          if (abortSignal.aborted) return;
          if (data.active && data.total > 0) {
            setParseProgress({
              phase: "reading",
              current: data.current,
              total: data.total,
              message: `Parsing ticker ${data.current}/${data.total}: ${data.ticker || "..."}`,
            });
          }
          if (!abortSignal.aborted) {
            setTimeout(poll, 1000);
          }
        })
        .catch(() => {
          if (!abortSignal.aborted) setTimeout(poll, 2000);
        });
    };
    // Delay first poll to give server time to start Python
    setTimeout(poll, 2000);
  }, []);

  // ── Replace upload (supports multiple files) ──
  const handleReplaceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    setUploading(true);
    setUploadResult(null);
    setUploadError(null);
    setParseProgress(null);

    try {
      const names = files.map(f => f.name).join(", ");
      const totalMB = (files.reduce((s, f) => s + f.size, 0) / (1024 * 1024)).toFixed(1);
      console.log(`Uploading ${files.length} file(s): ${names} (${totalMB} MB total)...`);

      const hasBackend = await checkBackend();
      if (hasBackend) {
        try {
          if (files.length > 1) {
            // Batch upload — all files in one request
            await startBatchUpload(files, "replace");
          } else {
            await startBackgroundUpload(files[0], "replace");
          }
          toast({
            title: `Upload started (${files.length} file${files.length > 1 ? "s" : ""})`,
            description: "Processing in the background — you can close this panel and keep using the app.",
          });
          setUploading(false);
          setParseProgress(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        } catch (serverErr: any) {
          console.warn("Background upload failed, trying client-side parse:", serverErr);
        }
      }

      // Fallback: client-side parse (single file only)
      const file = files[0];
      setParseProgress({ phase: "reading", current: 0, total: 1, message: `Parsing ${file.name} locally...` });
      const parsed = await parseWorkbook(file, (p) => setParseProgress(p));
      console.log(`Parsed: ${parsed.tickers.length} tickers, ${parsed.dates.length} dates`);

      if (hasBackend) {
        try {
          const data = await sendParsedToBackend(parsed, "replace");
          setUploadResult(`Successfully loaded ${data.tickers} tickers with ${data.dates} dates.`);
          toast({ title: "Data replaced", description: `${data.tickers} tickers, ${data.dates} dates loaded.` });
          fetchStatus();
          clearAllCaches();
          queryClient.invalidateQueries();
          return;
        } catch (_) {}
      }

      // Last resort: client-side injection
      injectParsedIntoClientCache(parsed, "replace");
      setUploadResult(
        `Loaded ${parsed.tickers.length} tickers with ${parsed.dates.length} dates. Session-only — will reset on page refresh.`
      );
      toast({ title: "Data loaded (session-only)", description: `${parsed.tickers.length} tickers loaded.` });
      fetchStatus();
    } catch (err: any) {
      setUploadError(`Error: ${err.message}`);
      console.error("Upload error:", err);
    } finally {
      setUploading(false);
      setParseProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [fetchStatus, toast, sendParsedToBackend, checkBackend, injectParsedIntoClientCache, parseWorkbook, serverParseUpload, startProgressPolling, startBackgroundUpload, startBatchUpload]);

  // Store the parsed workbook data for merge flow
  const parsedWorkbookRef = useRef<import("@/lib/excelParser").ParsedWorkbook | null>(null);
  // Store server-side preview data for merge apply
  const serverTempPathRef = useRef<string | null>(null);
  const mergeFileRef = useRef<File | null>(null);
  const mergeWorkbookNameRef = useRef<string>("");
  const mergeFileSizeRef = useRef<number>(0);

  // ── Merge upload phase 1: Preview (server-side or client-side) ──
  // Now supports multiple files — if >1 file, use batch endpoint directly (skip preview)
  const handleMergeUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    setMergeStep("uploading");
    setMergeResult(null);
    setMergeError(null);
    setPreview(null);
    setParseProgress(null);
    parsedWorkbookRef.current = null;
    serverTempPathRef.current = null;

    // Multi-file: batch upload in merge mode (no preview, just merge all)
    if (files.length > 1) {
      try {
        const hasBackend = await checkBackend();
        if (hasBackend) {
          await startBatchUpload(files, "merge");
          toast({
            title: `Merging ${files.length} workbooks`,
            description: "Processing in the background — you can close this panel and keep using the app.",
          });
          setMergeStep("idle");
          setParseProgress(null);
          if (mergeFileInputRef.current) mergeFileInputRef.current.value = "";
          return;
        } else {
          setMergeError("Multi-file upload requires a backend server.");
          setMergeStep("idle");
          return;
        }
      } catch (err: any) {
        setMergeError(err.message || "Batch upload error");
        setMergeStep("idle");
        if (mergeFileInputRef.current) mergeFileInputRef.current.value = "";
        return;
      }
    }

    // Single file: existing preview flow
    const file = files[0];
    mergeFileRef.current = file;
    mergeWorkbookNameRef.current = file.name;
    mergeFileSizeRef.current = file.size;

    try {
      const hasBackend = await checkBackend();

      if (hasBackend) {
        try {
          await startBackgroundUpload(file, "merge-preview");
          toast({
            title: "Analyzing workbook",
            description: "Parsing in the background — you can close this panel and keep using the app. Re-open to see the merge preview.",
          });
          setMergeStep("idle");
          setParseProgress(null);
          if (mergeFileInputRef.current) mergeFileInputRef.current.value = "";
          return;
        } catch (serverErr: any) {
          console.warn("Background merge-preview failed, falling back to client-side:", serverErr);
        }
      }

      // Fallback: client-side parse (blocking — stays in dialog)
      const parsed = await parseWorkbook(file, (p) => setParseProgress(p));
      parsedWorkbookRef.current = parsed;

      // Determine conflicts
      let existingTickers: string[] = [];
      const cachedTickers = getTickersCacheSync();
      if (cachedTickers && cachedTickers.length > 0) {
        existingTickers = cachedTickers.map(t => t.ticker);
      } else {
        try {
          if (hasBackend) {
            const resp = await apiRequest("GET", "/api/tickers");
            const tickers = await resp.json();
            existingTickers = tickers.map((t: any) => t.ticker);
          } else {
            const resp = await fetch("data/tickers.json");
            if (resp.ok) {
              const tickers = await resp.json();
              existingTickers = tickers.map((t: any) => t.ticker);
            }
          }
        } catch (_) {}
      }

      const existingSet = new Set(existingTickers);
      const conflicts = parsed.tickers.filter(t => existingSet.has(t.ticker)).map(t => t.ticker);
      const newOnly = parsed.tickers.filter(t => !existingSet.has(t.ticker)).map(t => t.ticker);

      setPreview({
        newTickers: newOnly,
        conflicts,
        totalNew: newOnly.length,
        totalExisting: existingTickers.length,
        newEventTickers: Object.keys(parsed.events).filter(t => new Set(parsed.tickers.map(t => t.ticker)).has(t)).length,
        tempDir: "__client_parsed__",
      });

      const defaultRes: Record<string, "overwrite" | "keep"> = {};
      for (const ticker of conflicts) {
        defaultRes[ticker] = "keep";
      }
      setResolutions(defaultRes);
      setMergeStep(conflicts.length > 0 ? "resolving" : "preview");
    } catch (err: any) {
      setMergeError(err.message || "Parse error");
      setMergeStep("idle");
    } finally {
      setParseProgress(null);
      if (mergeFileInputRef.current) mergeFileInputRef.current.value = "";
    }
  }, [toast, checkBackend, parseWorkbook, startBackgroundUpload, startBatchUpload]);

  // ── Merge upload phase 2: Apply ──
  const handleMergeApply = useCallback(async () => {
    if (!preview) return;

    setMergeStep("merging");
    setMergeError(null);

    try {
      const added = preview.newTickers.length;
      const overwritten = Object.values(resolutions).filter(v => v === "overwrite").length;
      const kept = Object.values(resolutions).filter(v => v === "keep").length;

      const hasBackend = await checkBackend();

      // Path A: Server-side merge (data already parsed on server)
      if (serverTempPathRef.current && hasBackend) {
        try {
          setParseProgress({ phase: "done", current: 0, total: 0, message: "Applying merge on server..." });
          const resp = await apiRequest("POST", "/api/data/server-merge-apply", {
            tempPath: serverTempPathRef.current,
            mergeMode: "merge",
            resolutions: JSON.stringify(resolutions),
            workbookName: mergeWorkbookNameRef.current,
            fileSize: mergeFileSizeRef.current,
          });
          const data = await resp.json();
          if (resp.ok && data.ok) {
            const parts = [];
            if (data.added > 0) parts.push(`${data.added} new`);
            if (data.overwritten > 0) parts.push(`${data.overwritten} overwritten`);
            if (data.kept > 0) parts.push(`${data.kept} kept`);
            const summary = `Merged: ${parts.join(", ")}. Total: ${data.tickers} tickers, ${data.dates} dates.`;
            setMergeResult(summary);
            setMergeStep("done");
            toast({ title: "Workbooks merged", description: summary });
            fetchStatus();
            clearAllCaches();
            queryClient.invalidateQueries();
            serverTempPathRef.current = null;
            parsedWorkbookRef.current = null;
            return;
          }
          throw new Error(data.error || "Server merge failed");
        } catch (serverErr: any) {
          console.warn("Server merge-apply failed:", serverErr);
          setMergeError(serverErr.message);
          setMergeStep("resolving");
          return;
        } finally {
          setParseProgress(null);
        }
      }

      // Path B: Client-side parsed data
      if (!parsedWorkbookRef.current) {
        setMergeError("No parsed data available. Please re-upload the workbook.");
        setMergeStep("idle");
        return;
      }

      const parsed = parsedWorkbookRef.current;

      // Filter tickerData based on resolutions
      const conflictSet = new Set(preview.conflicts);
      const filteredTickerData: Record<string, Record<string, (number | string)[]>> = {};
      const filteredTickers: typeof parsed.tickers = [];

      for (const t of parsed.tickers) {
        if (conflictSet.has(t.ticker)) {
          if (resolutions[t.ticker] === "overwrite") {
            filteredTickerData[t.ticker] = parsed.tickerData[t.ticker];
            filteredTickers.push(t);
          }
        } else {
          filteredTickerData[t.ticker] = parsed.tickerData[t.ticker];
          filteredTickers.push(t);
        }
      }

      const filteredParsed: import("@/lib/excelParser").ParsedWorkbook = {
        tickers: filteredTickers,
        dates: parsed.dates,
        events: parsed.events,
        tickerData: filteredTickerData,
        workbookName: parsed.workbookName,
      };

      if (hasBackend) {
        try {
          const data = await sendParsedToBackend(filteredParsed, "merge");
          const parts = [];
          if (added > 0) parts.push(`${added} new`);
          if (overwritten > 0) parts.push(`${overwritten} overwritten`);
          if (kept > 0) parts.push(`${kept} kept`);
          const summary = `Merged: ${parts.join(", ")}. Total: ${data.tickers} tickers, ${data.dates} dates.`;
          setMergeResult(summary);
          setMergeStep("done");
          toast({ title: "Workbooks merged", description: summary });
          fetchStatus();
          clearAllCaches();
          queryClient.invalidateQueries();
          parsedWorkbookRef.current = null;
          return;
        } catch (backendErr: any) {
          console.warn("Backend merge failed, falling back to client injection:", backendErr);
        }
      }

      // Last resort: client-side injection
      injectParsedIntoClientCache(filteredParsed, "merge");
      const parts = [];
      if (added > 0) parts.push(`${added} new`);
      if (overwritten > 0) parts.push(`${overwritten} overwritten`);
      if (kept > 0) parts.push(`${kept} kept`);
      const summary = `Merged: ${parts.join(", ")}. ${filteredTickers.length} tickers. Session-only.`;
      setMergeResult(summary);
      setMergeStep("done");
      toast({ title: "Merged (session-only)", description: `${parts.join(", ")}` });
      fetchStatus();
      parsedWorkbookRef.current = null;
    } catch (err: any) {
      setMergeError(err.message || "Merge error");
      setMergeStep("resolving");
    }
  }, [preview, resolutions, fetchStatus, toast, sendParsedToBackend, checkBackend, injectParsedIntoClientCache]);

  const toggleResolution = (ticker: string) => {
    setResolutions(prev => ({
      ...prev,
      [ticker]: prev[ticker] === "overwrite" ? "keep" : "overwrite",
    }));
  };

  const setAllResolutions = (value: "overwrite" | "keep") => {
    if (!preview) return;
    const updated: Record<string, "overwrite" | "keep"> = {};
    for (const ticker of preview.conflicts) {
      updated[ticker] = value;
    }
    setResolutions(updated);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <button
          className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Manage data"
          data-testid="data-manager-btn"
        >
          <Database className="w-3 h-3" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Data Management</DialogTitle>
        </DialogHeader>

        {/* Current data status */}
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <Database className="w-3 h-3" />
            Current Data
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
          </div>
          {status ? (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div>
                <span className="text-muted-foreground">Tickers:</span>{" "}
                <span className="font-medium">{status.tickers}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Dates:</span>{" "}
                <span className="font-medium">{status.dates}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Latest date:</span>{" "}
                <span className="font-medium">{status.lastDate || "N/A"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Last updated:</span>{" "}
                <span className="font-medium">
                  {new Date(status.lastUpdated).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Loading...</div>
          )}
        </div>

        {/* Data Sources audit panel */}
        <div className="rounded-md border border-border">
          <button
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => {
              const next = !sourcesOpen;
              setSourcesOpen(next);
              if (next && !sourcesData) fetchSources();
            }}
            data-testid="sources-toggle"
          >
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Data Sources
            </div>
            {sourcesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>

          {sourcesOpen && (
            <div className="border-t border-border px-3 pb-3 pt-2 space-y-2">
              {sourcesLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Loading sources...
                </div>
              ) : sourcesData ? (
                <>
                  {/* Workbook summary cards */}
                  {sourcesData.workbooks.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-1">No source data available yet. Upload a workbook to start tracking.</div>
                  ) : (
                    <>
                      {/* Stale-data summary banner */}
                      {(() => {
                        const staleTickers = Object.entries(sourcesData.sources).filter(([, info]) => isStale(info.uploadedAt));
                        if (staleTickers.length === 0) return null;
                        return (
                          <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] text-red-400">
                            <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>
                              <strong>{staleTickers.length}</strong> ticker{staleTickers.length !== 1 ? "s" : ""} uploaded more than {STALE_DAYS} days ago
                            </span>
                          </div>
                        );
                      })()}

                      {sourcesData.workbooks.map(wb => {
                        const isExpanded = expandedWorkbooks.has(wb.name);
                        const wbStale = isStale(wb.uploadedAt);
                        const filteredTickers = sourcesFilter
                          ? wb.tickers.filter(t => t.toLowerCase().includes(sourcesFilter.toLowerCase()))
                          : wb.tickers;
                        return (
                          <div key={wb.name} className={`rounded border ${wbStale ? "border-red-500/40 bg-red-500/5" : "border-border bg-muted/20"}`}>
                            <div className="flex items-center gap-2 px-2.5 py-2">
                              <button
                                className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                onClick={() => toggleWorkbook(wb.name)}
                              >
                                {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium truncate" title={wb.name}>{wb.name}</span>
                                    {wbStale && (
                                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 text-[9px] font-semibold uppercase tracking-wide flex-shrink-0">
                                        <Clock className="w-2.5 h-2.5" />
                                        {daysAgo(wb.uploadedAt)}d old
                                      </span>
                                    )}
                                  </div>
                                  <div className={`text-[10px] flex gap-3 mt-0.5 ${wbStale ? "text-red-400/70" : "text-muted-foreground"}`}>
                                    <span>{wb.tickers.length} ticker{wb.tickers.length !== 1 ? "s" : ""}</span>
                                    <span>{formatBytes(wb.totalSize)}</span>
                                    <span>{formatDate(wb.uploadedAt)}</span>
                                  </div>
                                </div>
                              </button>
                              <button
                                className="p-1 rounded hover:bg-red-500/15 text-muted-foreground hover:text-red-400 transition-colors flex-shrink-0"
                                onClick={(e) => { e.stopPropagation(); setWipeWorkbookName(wipeWorkbookName === wb.name ? null : wb.name); }}
                                title={`Remove ${wb.name}`}
                                data-testid={`remove-workbook-${wb.name}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Per-workbook wipe confirmation */}
                            {wipeWorkbookName === wb.name && (
                              <div className="border-t border-red-500/30 bg-red-500/10 px-2.5 py-2 space-y-2">
                                <div className="text-[11px] text-red-400">
                                  Remove <strong>{wb.tickers.length}</strong> ticker{wb.tickers.length !== 1 ? "s" : ""} from <strong>{wb.name}</strong>? This cannot be undone.
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="flex-1 h-6 text-[11px]"
                                    onClick={() => setWipeWorkbookName(null)}
                                    disabled={wipingWorkbook}
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="flex-1 h-6 text-[11px]"
                                    onClick={() => handleWipeWorkbook(wb.name)}
                                    disabled={wipingWorkbook}
                                    data-testid={`confirm-remove-workbook-${wb.name}`}
                                  >
                                    {wipingWorkbook ? (
                                      <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Removing...</>
                                    ) : (
                                      <><Trash2 className="w-3 h-3 mr-1" />Remove</>
                                    )}
                                  </Button>
                                </div>
                              </div>
                            )}

                            {isExpanded && (
                              <div className="border-t border-border px-2.5 py-2 space-y-1.5">
                                {/* Search filter */}
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                                  <Input
                                    placeholder="Filter tickers..."
                                    className="h-6 text-[10px] pl-6"
                                    value={sourcesFilter}
                                    onChange={e => setSourcesFilter(e.target.value)}
                                  />
                                </div>

                                {/* Ticker table */}
                                <div className="max-h-48 overflow-y-auto">
                                  <table className="w-full text-[10px]">
                                    <thead>
                                      <tr className="text-muted-foreground border-b border-border">
                                        <th className="text-left py-1 pr-2 font-medium">Ticker</th>
                                        <th className="text-right py-1 px-2 font-medium">Dates</th>
                                        <th className="text-right py-1 px-2 font-medium">Metrics</th>
                                        <th className="text-right py-1 pl-2 font-medium">Size</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {filteredTickers.sort().map(ticker => {
                                        const info = sourcesData.sources[ticker];
                                        if (!info) return null;
                                        const tickerStale = isStale(info.uploadedAt);
                                        return (
                                          <tr key={ticker} className={`border-b border-border/50 ${tickerStale ? "bg-red-500/8 hover:bg-red-500/12" : "hover:bg-muted/40"}`}>
                                            <td className={`py-1 pr-2 font-mono font-medium ${tickerStale ? "text-red-400" : ""}`}>
                                              {ticker}
                                              {tickerStale && (
                                                <span className="ml-1.5 inline-flex items-center gap-0.5 px-1 py-px rounded bg-red-500/15 text-red-400 text-[8px] font-semibold uppercase tracking-wide">
                                                  <Clock className="w-2 h-2" />
                                                  {daysAgo(info.uploadedAt)}d
                                                </span>
                                              )}
                                            </td>
                                            <td className={`py-1 px-2 text-right tabular-nums ${tickerStale ? "text-red-400/70" : "text-muted-foreground"}`}>{info.dates.toLocaleString()}</td>
                                            <td className={`py-1 px-2 text-right tabular-nums ${tickerStale ? "text-red-400/70" : "text-muted-foreground"}`}>{info.metrics}</td>
                                            <td className={`py-1 pl-2 text-right tabular-nums ${tickerStale ? "text-red-400/70" : "text-muted-foreground"}`}>{formatBytes(info.fileSize)}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                  {filteredTickers.length === 0 && (
                                    <div className="text-[10px] text-muted-foreground py-2 text-center">No matching tickers</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  )}
                </>
              ) : (
                <div className="text-xs text-muted-foreground py-1">Failed to load sources.</div>
              )}
            </div>
          )}
        </div>

        {/* Upload mode selector */}
        <div className="flex gap-2">
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
              uploadMode === "merge"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            onClick={() => { setUploadMode("merge"); resetState(); }}
          >
            <GitMerge className="w-3.5 h-3.5" />
            Merge Workbook
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${
              uploadMode === "replace"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
            }`}
            onClick={() => { setUploadMode("replace"); resetState(); }}
          >
            <Replace className="w-3.5 h-3.5" />
            Replace All
          </button>
        </div>

        {/* ═══ MERGE MODE ═══ */}
        {uploadMode === "merge" && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground leading-relaxed">
              Upload one or more workbooks to <strong>add their tickers</strong> to the existing data. Select multiple files at once to batch-merge them all. Single-file uploads show a conflict preview first.
            </div>

            {/* Step 1: Upload */}
            {(mergeStep === "idle" || mergeStep === "uploading") && (
              <>
                <input
                  ref={mergeFileInputRef}
                  type="file"
                  accept=".xlsb,.xlsx,.xlsm,.xls"
                  multiple
                  className="hidden"
                  onChange={handleMergeUpload}
                  data-testid="merge-file-input"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => mergeFileInputRef.current?.click()}
                  disabled={mergeStep === "uploading"}
                  data-testid="merge-upload-btn"
                >
                  {mergeStep === "uploading" ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      {parseProgress ? parseProgress.message : "Parsing workbook(s)..."}
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5 mr-1.5" />
                      Select Workbook(s) to Merge
                    </>
                  )}
                </Button>
              </>
            )}

            {/* Step 2: Preview (no conflicts) */}
            {mergeStep === "preview" && preview && (
              <div className="space-y-3">
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    No conflicts found
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <strong>{preview.newTickers.length}</strong> new ticker{preview.newTickers.length !== 1 ? "s" : ""} will be added.
                  </div>
                  {preview.newTickers.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {preview.newTickers.map(t => (
                        <span key={t} className="px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 text-[10px] font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setMergeStep("idle"); setPreview(null); }}>
                    Cancel
                  </Button>
                  <Button size="sm" className="flex-1" onClick={handleMergeApply}>
                    <GitMerge className="w-3.5 h-3.5 mr-1.5" />
                    Merge {preview.newTickers.length} Ticker{preview.newTickers.length !== 1 ? "s" : ""}
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Conflict resolution */}
            {mergeStep === "resolving" && preview && (
              <div className="space-y-3">
                {/* New tickers summary */}
                {preview.newTickers.length > 0 && (
                  <div className="rounded-md border border-border bg-muted/30 p-2.5">
                    <div className="text-xs text-muted-foreground mb-1">
                      <strong className="text-green-400">{preview.newTickers.length}</strong> new ticker{preview.newTickers.length !== 1 ? "s" : ""} will be added:
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {preview.newTickers.map(t => (
                        <span key={t} className="px-1.5 py-0.5 rounded bg-green-400/10 text-green-400 text-[10px] font-mono">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conflicts */}
                <div className="rounded-md border border-orange-500/30 bg-orange-500/5 p-2.5 space-y-2">
                  <div className="text-xs font-medium text-orange-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {preview.conflicts.length} ticker{preview.conflicts.length !== 1 ? "s" : ""} already exist{preview.conflicts.length === 1 ? "s" : ""}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    For each conflict, choose whether to <strong>overwrite</strong> with new data or <strong>keep</strong> the existing data.
                  </div>

                  {/* Bulk actions */}
                  <div className="flex gap-2 pb-1 border-b border-border">
                    <button
                      className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      onClick={() => setAllResolutions("overwrite")}
                    >
                      Overwrite all
                    </button>
                    <button
                      className="text-[10px] text-muted-foreground hover:text-foreground underline"
                      onClick={() => setAllResolutions("keep")}
                    >
                      Keep all
                    </button>
                  </div>

                  {/* Conflict list */}
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {preview.conflicts.map(ticker => {
                      const isOverwrite = resolutions[ticker] === "overwrite";
                      return (
                        <div
                          key={ticker}
                          className={`flex items-center justify-between px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                            isOverwrite
                              ? "bg-orange-500/10 hover:bg-orange-500/15"
                              : "bg-muted/40 hover:bg-muted/60"
                          }`}
                          onClick={() => toggleResolution(ticker)}
                        >
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={isOverwrite}
                              onCheckedChange={() => toggleResolution(ticker)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="font-mono font-medium">{ticker}</span>
                          </div>
                          <span className={`text-[10px] font-medium ${isOverwrite ? "text-orange-400" : "text-muted-foreground"}`}>
                            {isOverwrite ? "overwrite" : "keep existing"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setMergeStep("idle"); setPreview(null); }}>
                    Cancel
                  </Button>
                  <Button size="sm" className="flex-1" onClick={handleMergeApply}>
                    <GitMerge className="w-3.5 h-3.5 mr-1.5" />
                    Apply Merge
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: Merging */}
            {mergeStep === "merging" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-3">
                <Loader2 className="w-4 h-4 animate-spin" />
                Merging workbooks...
              </div>
            )}

            {/* Step 5: Done */}
            {mergeStep === "done" && mergeResult && (
              <div className="flex items-start gap-2 text-xs text-green-400 bg-green-400/10 rounded-md p-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  {mergeResult}
                  <br />
                  <span className="text-green-400/70 text-[10px]">Close this dialog to see the updated data across all tabs.</span>
                </div>
              </div>
            )}

            {mergeError && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>{mergeError}</div>
              </div>
            )}

            {/* Batch job progress (shown when multi-file merge is running) */}
            {activeJob && activeJob.batchTotal && activeJob.batchTotal > 1 && (activeJob.status === "uploading" || activeJob.status === "parsing" || activeJob.status === "writing") && (
              <div className="flex items-start gap-2 text-xs text-primary bg-primary/10 rounded-md p-2">
                <Loader2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 animate-spin" />
                <div>
                  Processing workbook {activeJob.batchCurrent || 1}/{activeJob.batchTotal}: {activeJob.batchWorkbooks?.[Math.max(0, (activeJob.batchCurrent || 1) - 1)] || "..."}
                  <br />
                  <span className="text-primary/60 text-[10px]">You can close this panel and keep using the app.</span>
                </div>
              </div>
            )}

            {activeJob && activeJob.batchTotal && activeJob.batchTotal > 1 && activeJob.status === "complete" && (
              <div className="flex items-start gap-2 text-xs text-green-400 bg-green-400/10 rounded-md p-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  Merged {activeJob.result?.tickers} tickers with {activeJob.result?.dates} dates.
                  {activeJob.batchResults && (
                    <>
                      <br />
                      <span className="text-green-400/80 text-[10px]">
                        {activeJob.batchResults.filter(r => r.status === "ok").length}/{activeJob.batchTotal} workbooks processed successfully.
                      </span>
                    </>
                  )}
                  <br />
                  <span className="text-green-400/70 text-[10px]">Close this dialog to see the updated data across all tabs.</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ REPLACE MODE ═══ */}
        {uploadMode === "replace" && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground leading-relaxed">
              Upload one or more workbooks to <strong>replace all</strong> existing ticker data. The first file wipes existing data; additional files are merged in.
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsb,.xlsx,.xlsm,.xls"
              multiple
              className="hidden"
              onChange={handleReplaceUpload}
              data-testid="workbook-file-input"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || (activeJob != null && activeJob.status !== "complete" && activeJob.status !== "error")}
              data-testid="upload-workbook-btn"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  {parseProgress ? parseProgress.message : "Processing workbook(s)..."}
                </>
              ) : (
                <>
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  Upload &amp; Replace All Data
                </>
              )}
            </Button>

            {/* Show background job status */}
            {activeJob && (activeJob.status === "uploading" || activeJob.status === "parsing" || activeJob.status === "writing") && (
              <div className="flex items-start gap-2 text-xs text-primary bg-primary/10 rounded-md p-2">
                <Loader2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 animate-spin" />
                <div>
                  {activeJob.status === "uploading" && `Uploading ${activeJob.batchTotal && activeJob.batchTotal > 1 ? `${activeJob.batchTotal} workbooks` : activeJob.workbookName}...`}
                  {activeJob.status === "parsing" && activeJob.batchTotal && activeJob.batchTotal > 1
                    ? `Processing workbook ${activeJob.batchCurrent || 1}/${activeJob.batchTotal}: ${activeJob.batchWorkbooks?.[Math.max(0, (activeJob.batchCurrent || 1) - 1)] || "..."}`
                    : activeJob.status === "parsing" && activeJob.progress && activeJob.progress.total > 0
                      ? `Parsing ${activeJob.progress.current}/${activeJob.progress.total}: ${activeJob.progress.ticker}`
                      : activeJob.status === "parsing" && `Parsing ${activeJob.workbookName}...`}
                  {activeJob.status === "writing" && "Finalizing..."}
                  <br />
                  <span className="text-primary/60 text-[10px]">You can close this panel and keep using the app. Progress is shown in the nav bar.</span>
                </div>
              </div>
            )}

            {activeJob && activeJob.status === "complete" && (
              <div className="flex items-start gap-2 text-xs text-green-400 bg-green-400/10 rounded-md p-2">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  Successfully loaded {activeJob.result?.tickers} tickers with {activeJob.result?.dates} dates.
                  {activeJob.batchTotal && activeJob.batchTotal > 1 && activeJob.batchResults && (
                    <>
                      <br />
                      <span className="text-green-400/80 text-[10px]">
                        {activeJob.batchResults.filter(r => r.status === "ok").length}/{activeJob.batchTotal} workbooks processed successfully.
                        {activeJob.batchResults.some(r => r.status !== "ok") && (
                          <> {activeJob.batchResults.filter(r => r.status !== "ok").length} had errors.</>
                        )}
                      </span>
                    </>
                  )}
                  <br />
                  <span className="text-green-400/70 text-[10px]">Close this dialog to see the updated data across all tabs.</span>
                </div>
              </div>
            )}

            {activeJob && activeJob.status === "error" && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>Background upload failed: {activeJob.error}</div>
              </div>
            )}

            {uploadResult && !activeJob && (
              <div className="flex items-start gap-2 text-xs text-green-400 bg-green-400/10 rounded-md p-2">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>
                  {uploadResult}
                  <br />
                  <span className="text-green-400/70 text-[10px]">Close this dialog to see the updated data across all tabs.</span>
                </div>
              </div>
            )}

            {uploadError && !activeJob && (
              <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                <div>{uploadError}</div>
              </div>
            )}
          </div>
        )}

        {/* Supplementary Data */}
        <div className="pt-3 border-t border-border space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-foreground">Supplementary Data</span>
          </div>

          {/* Fundamental Data Upload */}
          <FundamentalUploadSection />

          <div className="border-t border-border" />

          {/* Show loaded cap rate workbook */}
          {capRateMeta?.loaded && (
            <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2.5 space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-xs font-medium text-foreground truncate" title={capRateMeta.workbook}>
                  {capRateMeta.workbook}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground pl-5">
                {capRateMeta.tickersUpdated} tickers · {(capRateMeta.totalPoints || 0).toLocaleString()} data points
                {capRateMeta.uploadedAt && (
                  <> · {new Date(capRateMeta.uploadedAt).toLocaleDateString()}</>
                )}
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">
            Upload an implied cap rate workbook to update weekly cap rate data. Ticker sheets with dates in column A and implied cap rates in column H will be matched to existing tickers.
          </p>
          <div>
            <input
              ref={capRateFileRef}
              type="file"
              accept=".xlsx,.xlsm,.xlsb,.xls"
              multiple
              className="hidden"
              onChange={handleCapRateUpload}
              data-testid="caprate-file-input"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5 w-full"
              onClick={() => capRateFileRef.current?.click()}
              disabled={capRateUploading}
              data-testid="caprate-upload-btn"
            >
              {capRateUploading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing cap rates...</>
              ) : (
                <><Upload className="w-3.5 h-3.5" /> Upload Cap Rate Workbook(s)</>
              )}
            </Button>
          </div>

          {/* Remove implied cap rate data from all tickers */}
          <div className="flex items-center gap-2">
            {!capRateConfirmRemove ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => setCapRateConfirmRemove(true)}
                title="Remove implied cap rate data from all tickers"
                data-testid="caprate-remove-btn"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Remove
              </Button>
            ) : (
              <>
                <span className="text-[11px] text-muted-foreground">Remove cap rate data from all tickers?</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs ml-auto"
                  onClick={() => setCapRateConfirmRemove(false)}
                  disabled={capRateRemoving}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleRemoveCapRate}
                  disabled={capRateRemoving}
                  data-testid="caprate-remove-confirm-btn"
                >
                  {capRateRemoving ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Removing...</>
                  ) : (
                    "Remove"
                  )}
                </Button>
              </>
            )}
          </div>

          {capRateResult && (
            <div className="flex items-start gap-2 text-xs text-green-400 bg-green-500/10 rounded-md p-2">
              <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div>{capRateResult}</div>
            </div>
          )}

          {capRateError && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div>{capRateError}</div>
            </div>
          )}
        </div>

        {/* Wipe Data */}
        <div className="pt-1 border-t border-border">
          {!wipeConfirm ? (
            <button
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-red-400 transition-colors"
              onClick={() => setWipeConfirm(true)}
              data-testid="wipe-data-btn"
            >
              <Trash2 className="w-3 h-3" />
              Wipe All Data
            </button>
          ) : (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 space-y-2">
              <div className="text-xs text-red-400 font-medium">Are you sure?</div>
              <div className="text-[11px] text-red-400/80">
                This will permanently delete all ticker data, dates, events, and source tracking. Saved workspaces will remain but have no data to display.
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => setWipeConfirm(false)}
                  disabled={wiping}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={handleWipe}
                  disabled={wiping}
                  data-testid="wipe-confirm-btn"
                >
                  {wiping ? (
                    <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Wiping...</>
                  ) : (
                    <><Trash2 className="w-3 h-3 mr-1.5" />Wipe Everything</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="text-[11px] text-muted-foreground space-y-1 pt-1 border-t border-border">
          <div className="font-medium">Tips:</div>
          <ul className="list-disc pl-4 space-y-0.5">
            <li><strong>Merge</strong> adds new tickers from a second workbook alongside existing data.</li>
            <li><strong>Replace</strong> wipes everything and loads fresh from one workbook.</li>
            <li>Workbooks should have <code className="bg-muted px-0.5 rounded">_mktdata</code> sheets per ticker and a <code className="bg-muted px-0.5 rounded">Tickerlist</code> sheet.</li>
            <li>After upload, data is immediately available across all tabs.</li>
            <li>Your saved workspaces are not affected — they reference tickers by name.</li>
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Fundamental Upload Section (inside Supplementary Data) ──
function FundamentalUploadSection() {
  const { fundamentalSheets, uploadFundamentalWorkbook, removeFundamentalWorkbook } = useUpload();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Group sheets by workbook
  const workbooks = useMemo(() => {
    const map: Record<string, { name: string; sheetCount: number; metricCount: number }> = {};
    for (const s of fundamentalSheets) {
      const wb = s.workbook || "unknown";
      if (!map[wb]) map[wb] = { name: wb, sheetCount: 0, metricCount: 0 };
      map[wb].sheetCount++;
      map[wb].metricCount += s.metrics.length;
    }
    return Object.values(map);
  }, [fundamentalSheets]);

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setUploading(true);
    setResult(null);
    setError(null);
    const results: string[] = [];
    const errors: string[] = [];
    for (const file of files) {
      try {
        const msg = await uploadFundamentalWorkbook(file);
        results.push(msg);
      } catch (err: any) {
        errors.push(`${file.name}: ${err.message || "Failed to parse"}`);
      }
    }
    if (results.length > 0) setResult(results.join(" | "));
    if (errors.length > 0) setError(errors.join(" | "));
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [uploadFundamentalWorkbook]);

  return (
    <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2.5 space-y-2">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
        <span className="text-xs font-medium text-foreground">Fundamental Data</span>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Upload custom fundamental workbooks (one sheet per ticker, metrics as rows, dates as columns). Data becomes available in Charts, Screener, Ranking, Scatter, Pairs, Valuation, and Correlation.
      </p>
      {workbooks.length > 0 && (
        <div className="space-y-1">
          {workbooks.map(wb => (
            <div key={wb.name} className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[11px]">
              <FileSpreadsheet className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              <span className="truncate flex-1 text-foreground" title={wb.name}>{wb.name}</span>
              <span className="text-[9px] text-muted-foreground/60 flex-shrink-0">{wb.sheetCount}sh / {wb.metricCount}m</span>
              <button
                className="text-muted-foreground/50 hover:text-red-400 transition-colors flex-shrink-0"
                onClick={() => removeFundamentalWorkbook(wb.name)}
                title={`Remove ${wb.name}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div>
        <input ref={fileRef} type="file" accept=".xlsx,.xlsb,.xlsm,.xls,.csv" multiple className="hidden" onChange={handleUpload} data-testid="fund-file-input" />
        <Button
          variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full"
          onClick={() => fileRef.current?.click()} disabled={uploading}
          data-testid="fund-upload-btn-dm"
        >
          {uploading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Parsing...</>
          ) : (
            <><Upload className="w-3.5 h-3.5" /> Upload Fundamental Workbook(s)</>
          )}
        </Button>
      </div>
      {result && (
        <div className="flex items-start gap-2 text-xs text-green-400 bg-green-500/10 rounded-md p-2">
          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>{result}</div>
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md p-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}
    </div>
  );
}
