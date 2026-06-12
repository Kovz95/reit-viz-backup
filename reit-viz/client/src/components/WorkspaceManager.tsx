import { useState, useEffect, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, FolderOpen, Trash2, Plus, Clock, Download, Upload } from "lucide-react";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** True when running on the deployed static site (POST/PUT/DELETE blocked). */
const isDeployed = API_BASE !== "";

interface WorkspaceMeta {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
}

interface WorkspaceManagerProps {
  onSave: () => any; // returns the state object to save
  onLoad: (state: any) => void; // restores state from a loaded workspace
  /** Current active workspace id (so UI can highlight it) */
  activeWorkspaceId: number | null;
  onSetActiveWorkspaceId: (id: number | null) => void;
}

// ── In-memory workspace store for deployed mode ──
// Since localStorage/sessionStorage are blocked in sandboxed iframes,
// we keep workspaces in memory and offer file export/import.
let memoryWorkspaces: { id: number; name: string; createdAt: string; updatedAt: string; state: string }[] = [];
let nextMemId = 1;

export default function WorkspaceManager({
  onSave,
  onLoad,
  activeWorkspaceId,
  onSetActiveWorkspaceId,
}: WorkspaceManagerProps) {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const importRef = useRef<HTMLInputElement>(null);

  const fetchWorkspaces = useCallback(async () => {
    if (isDeployed) {
      setWorkspaces(memoryWorkspaces.map(({ state: _s, ...meta }) => meta));
      return;
    }
    try {
      const res = await apiRequest("GET", "/api/workspaces");
      const data = await res.json();
      setWorkspaces(data.filter((w: WorkspaceMeta) => w.name !== "__autosave__"));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) fetchWorkspaces();
  }, [open, fetchWorkspaces]);

  // ── Save new ──
  const handleSaveNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setLoading(true);
    try {
      const state = onSave();
      if (isDeployed) {
        const now = new Date().toISOString();
        const ws = { id: nextMemId++, name, createdAt: now, updatedAt: now, state: JSON.stringify(state) };
        memoryWorkspaces.push(ws);
        onSetActiveWorkspaceId(ws.id);
        toast({ title: "Workspace saved", description: `"${name}" created. Use Export to download.` });
      } else {
        const res = await apiRequest("POST", "/api/workspaces", {
          name,
          state: JSON.stringify(state),
        });
        const data = await res.json();
        onSetActiveWorkspaceId(data.id);
        toast({ title: "Workspace saved", description: `"${name}" created` });
      }
      setNewName("");
      fetchWorkspaces();
    } catch (e: any) {
      const msg = e.message?.includes("413") ? "Workspace too large. Try with fewer uploaded sheets." : e.message;
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    }
    setLoading(false);
  };

  // ── Overwrite ──
  const handleOverwrite = async (ws: WorkspaceMeta) => {
    setLoading(true);
    try {
      const state = onSave();
      if (isDeployed) {
        const entry = memoryWorkspaces.find((w) => w.id === ws.id);
        if (entry) {
          entry.state = JSON.stringify(state);
          entry.updatedAt = new Date().toISOString();
        }
        onSetActiveWorkspaceId(ws.id);
        toast({ title: "Workspace updated", description: `"${ws.name}" saved` });
      } else {
        await apiRequest("POST", `/api/workspaces/${ws.id}/update`, {
          state: JSON.stringify(state),
        });
        onSetActiveWorkspaceId(ws.id);
        toast({ title: "Workspace updated", description: `"${ws.name}" saved` });
      }
      fetchWorkspaces();
    } catch (e: any) {
      const msg = e.message?.includes("413") ? "Workspace too large. Try with fewer uploaded sheets." : e.message;
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    }
    setLoading(false);
  };

  // ── Load ──
  const handleLoad = async (ws: WorkspaceMeta) => {
    setLoading(true);
    try {
      if (isDeployed) {
        const entry = memoryWorkspaces.find((w) => w.id === ws.id);
        if (!entry) throw new Error("Workspace not found");
        const state = JSON.parse(entry.state);
        onLoad(state);
        onSetActiveWorkspaceId(ws.id);
        toast({ title: "Workspace loaded", description: `"${ws.name}" restored` });
      } else {
        const res = await apiRequest("GET", `/api/workspaces/${ws.id}`);
        const data = await res.json();
        const state = typeof data.state === "string" ? JSON.parse(data.state) : data.state;
        onLoad(state);
        onSetActiveWorkspaceId(ws.id);
        toast({ title: "Workspace loaded", description: `"${ws.name}" restored` });
      }
      setOpen(false);
    } catch (e: any) {
      toast({ title: "Load failed", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  // ── Delete ──
  const handleDelete = async (ws: WorkspaceMeta) => {
    try {
      if (isDeployed) {
        memoryWorkspaces = memoryWorkspaces.filter((w) => w.id !== ws.id);
        if (activeWorkspaceId === ws.id) onSetActiveWorkspaceId(null);
        toast({ title: "Deleted", description: `"${ws.name}" removed` });
      } else {
        await apiRequest("POST", `/api/workspaces/${ws.id}/delete`);
        if (activeWorkspaceId === ws.id) onSetActiveWorkspaceId(null);
        toast({ title: "Deleted", description: `"${ws.name}" removed` });
      }
      fetchWorkspaces();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  // ── Export workspace as JSON file download ──
  const handleExport = (ws: WorkspaceMeta) => {
    const entry = isDeployed
      ? memoryWorkspaces.find((w) => w.id === ws.id)
      : null;
    if (isDeployed && !entry) return;

    if (isDeployed) {
      const blob = new Blob(
        [JSON.stringify({ name: ws.name, state: JSON.parse(entry!.state) }, null, 2)],
        { type: "application/json" }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${ws.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported", description: `"${ws.name}" downloaded` });
    } else {
      // Server mode: fetch then download
      apiRequest("GET", `/api/workspaces/${ws.id}`)
        .then((res) => res.json())
        .then((data) => {
          const state = typeof data.state === "string" ? JSON.parse(data.state) : data.state;
          const blob = new Blob(
            [JSON.stringify({ name: ws.name, state }, null, 2)],
            { type: "application/json" }
          );
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${ws.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
          a.click();
          URL.revokeObjectURL(url);
          toast({ title: "Exported", description: `"${ws.name}" downloaded` });
        });
    }
  };

  // ── Import workspace from JSON file ──
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const name = parsed.name || file.name.replace(/\.json$/, "");
      const state = parsed.state;
      if (!state) throw new Error("Invalid workspace file — no state found");

      if (isDeployed) {
        const now = new Date().toISOString();
        const ws = { id: nextMemId++, name, createdAt: now, updatedAt: now, state: JSON.stringify(state) };
        memoryWorkspaces.push(ws);
        // Also immediately load it
        onLoad(state);
        onSetActiveWorkspaceId(ws.id);
        toast({ title: "Workspace imported", description: `"${name}" loaded` });
      } else {
        const res = await apiRequest("POST", "/api/workspaces", {
          name,
          state: JSON.stringify(state),
        });
        const data = await res.json();
        onSetActiveWorkspaceId(data.id);
        onLoad(state);
        toast({ title: "Workspace imported", description: `"${name}" loaded` });
      }
      fetchWorkspaces();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }
    if (importRef.current) importRef.current.value = "";
  };

  const fmtDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs gap-1.5"
          data-testid="workspace-btn"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Workspaces
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px] max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-sm">Workspaces</DialogTitle>
        </DialogHeader>

        {/* Save new */}
        <div className="flex gap-2 mt-1">
          <Input
            placeholder="New workspace name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveNew()}
            className="h-8 text-xs"
            data-testid="workspace-name-input"
          />
          <Button
            size="sm"
            className="h-8 px-3 text-xs gap-1.5"
            onClick={handleSaveNew}
            disabled={loading || !newName.trim()}
            data-testid="workspace-save-new"
          >
            <Plus className="w-3.5 h-3.5" />
            Save
          </Button>
        </div>

        {/* Import button */}
        <div className="flex gap-2">
          <input
            ref={importRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
            data-testid="workspace-import-input"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs gap-1.5"
            onClick={() => importRef.current?.click()}
            data-testid="workspace-import-btn"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Workspace
          </Button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1 mt-2 min-h-0">
          {workspaces.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No saved workspaces yet. Create one above.
            </p>
          ) : (
            workspaces.map((ws) => (
              <div
                key={ws.id}
                className={`flex items-center gap-2 p-2 rounded text-xs border ${
                  activeWorkspaceId === ws.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:bg-accent/50"
                }`}
                data-testid={`workspace-item-${ws.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{ws.name}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    {fmtDate(ws.updatedAt)}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => handleLoad(ws)}
                  disabled={loading}
                  data-testid={`workspace-load-${ws.id}`}
                >
                  Load
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => handleOverwrite(ws)}
                  disabled={loading}
                  data-testid={`workspace-overwrite-${ws.id}`}
                >
                  <Save className="w-3 h-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-1.5 text-[10px]"
                  onClick={() => handleExport(ws)}
                  title="Export as JSON file"
                  data-testid={`workspace-export-${ws.id}`}
                >
                  <Download className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(ws)}
                  disabled={loading}
                  data-testid={`workspace-delete-${ws.id}`}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
