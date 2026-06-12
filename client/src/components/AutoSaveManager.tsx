/**
 * AutoSaveManager — always-mounted component at the App level that handles
 * persisting ALL tab/page state to the backend __autosave__ workspace.
 *
 * Previously, autosave only ran from the Dashboard component, meaning state
 * changes on other tabs (Pairs, Ranking, etc.) were lost on page refresh
 * if Dashboard wasn't mounted. This component fixes that.
 *
 * Uses a polling interval (every 3s) to check if cacheVersion changed since
 * the last save. This avoids the problem where rapidly changing cacheVersion
 * in a useEffect dependency array would continuously reset a debounce timer,
 * preventing it from ever firing.
 *
 * On mount, it loads the __autosave__ workspace and calls restoreAll() so
 * every tab picks up its persisted state regardless of which route is active.
 */
import { useEffect, useRef, useState } from "react";
import { useWorkspaceContext } from "@/lib/workspaceContext";
import { useUniverse } from "@/lib/universeContext";
import { useUpload } from "@/lib/uploadContext";
import { apiRequest, API_BASE } from "@/lib/queryClient";

const isDeployed = API_BASE !== "";

// Module-level flags survive HMR / component re-mounts within the same page session
let _autoloadAttempted = false;
let _autosaveId: number | null = null;

export default function AutoSaveManager() {
  const { serializeAll, restoreAll, cacheVersion } = useWorkspaceContext();
  const universe = useUniverse();
  const { serializeFundamental, restoreFundamental } = useUpload();

  // Track readiness as React state so effects re-run when it changes
  const [ready, setReady] = useState(false);
  // Refs for the interval-based save — read inside callback, no effect deps needed
  const lastSavedVersionRef = useRef(-1);
  const savingRef = useRef(false);
  const cacheVersionRef = useRef(cacheVersion);
  cacheVersionRef.current = cacheVersion;
  const lastFundCountRef = useRef(-1);
  const serializeFundRef = useRef(serializeFundamental);
  serializeFundRef.current = serializeFundamental;

  // ── Auto-load on mount ──────────────────────────────────────────────
  useEffect(() => {
    if (_autoloadAttempted || isDeployed) return;
    _autoloadAttempted = true;

    (async () => {
      try {
        const res = await apiRequest("GET", "/api/workspaces");
        const workspaces: { id: number; name: string }[] = await res.json();
        const autosave = workspaces.find(w => w.name === "__autosave__");
        if (!autosave) {
          setReady(true);
          return;
        }
        _autosaveId = autosave.id;
        const wsRes = await apiRequest("GET", `/api/workspaces/${autosave.id}`);
        const wsData = await wsRes.json();
        const state = typeof wsData.state === "string" ? JSON.parse(wsData.state) : wsData.state;

        if (state) {
          // Restore universe context
          if (state.universe) universe.restore(state.universe);

          // Restore fundamental sheets (uploaded via Fundamental Data section)
          if (state.fundamentalSheets && Array.isArray(state.fundamentalSheets) && state.fundamentalSheets.length > 0) {
            restoreFundamental(state.fundamentalSheets);
          }

          // Backward compatibility: old format stored charts state at top level
          // with `tabs` as a nested sub-object for other tabs.
          // New format stores everything under `tabs` including "charts" key.
          if (state.tabs) {
            if (state.plottedSeries && !state.tabs.charts) {
              // Old format — migrate: put charts state into tabs.charts
              const chartsState = {
                plottedSeries: state.plottedSeries,
                panes: state.panes,
                activeTicker: state.activeTicker,
                chartConfig: state.chartConfig,
                activeView: state.activeView,
                uploadedSheets: state.uploadedSheets,
                nextPaneId: state.nextPaneId,
                customChartViews: state.customChartViews,
              };
              restoreAll({ ...state.tabs, charts: chartsState });
            } else {
              restoreAll(state.tabs);
            }
          } else if (state.plottedSeries) {
            // Very old format with no tabs object at all
            restoreAll({ charts: state });
          }

          // Delay readiness to avoid saving the restore itself as a new autosave.
          // During this window, cacheVersion changes from restore are ignored.
          setTimeout(() => setReady(true), 2500);
        } else {
          setReady(true);
        }
      } catch {
        setReady(true);
      }
    })();
  }, [restoreAll, restoreFundamental, universe]);

  // ── Auto-save via polling interval (every 3s) ──────────────────────
  // Using an interval instead of a cacheVersion-dependent effect avoids the
  // problem where rapid cacheVersion increments keep resetting the debounce
  // timer so it never fires.
  useEffect(() => {
    if (isDeployed || !ready) return;

    const intervalId = setInterval(async () => {
      if (savingRef.current) return;
      const currentVersion = cacheVersionRef.current;
      const currentFundCount = serializeFundRef.current().length;
      const fundChanged = currentFundCount !== lastFundCountRef.current;
      if (currentVersion === lastSavedVersionRef.current && !fundChanged) return;

      savingRef.current = true;
      try {
        const tabStates = serializeAll();
        const fundSheets = serializeFundamental();
        const hasData = Object.keys(tabStates).length > 0 || fundSheets.length > 0;
        if (!hasData) { savingRef.current = false; return; }

        const state: Record<string, any> = {
          tabs: tabStates,
          universe: universe.serialize(),
        };
        if (fundSheets.length > 0) {
          state.fundamentalSheets = fundSheets;
        }
        const stateStr = JSON.stringify(state);

        if (_autosaveId) {
          await apiRequest("POST", `/api/workspaces/${_autosaveId}/update`, { state: stateStr });
        } else {
          const res = await apiRequest("POST", "/api/workspaces", {
            name: "__autosave__",
            state: stateStr,
          });
          const data = await res.json();
          _autosaveId = data.id;
        }
        lastSavedVersionRef.current = currentVersion;
        lastFundCountRef.current = currentFundCount;
      } catch {
        // Silently fail — autosave is best-effort
      } finally {
        savingRef.current = false;
      }
    }, 3000);

    return () => clearInterval(intervalId);
  }, [ready]); // Only depend on `ready` — read everything else via refs/callbacks

  return null;
}
