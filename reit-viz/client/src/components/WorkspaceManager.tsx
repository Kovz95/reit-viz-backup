// Reconstructed from recovered-bundle/index-CsG73Aq_.js (component Cqe) on 2026-06-17
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Save,
  FolderOpen,
  Trash2,
  Plus,
  Clock,
  Download,
  Upload,
  ChevronRight,
  ChevronDown,
  Pencil,
  Check,
  X,
  FolderPlus,
  FolderInput,
} from "lucide-react";
import { apiRequest, API_BASE } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** True when running on the deployed static site (POST/PUT/DELETE blocked). */
const isDeployed = API_BASE !== "";

interface WorkspaceMeta {
  id: number;
  name: string;
  folder: string | null;
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
let memoryWorkspaces: {
  id: number;
  name: string;
  folder: string | null;
  createdAt: string;
  updatedAt: string;
  state: string;
}[] = [];
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
  const [selectedFolder, setSelectedFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const importRef = useRef<HTMLInputElement>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");
  const [localFolders, setLocalFolders] = useState<string[]>([]);

  const folders = Array.from(
    new Set([
      ...workspaces.filter((w) => w.folder).map((w) => w.folder as string),
      ...localFolders,
    ])
  ).sort((a, b) => a.localeCompare(b));

  const toggleFolder = (name: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const fetchWorkspaces = useCallback(async () => {
    if (isDeployed) {
      setWorkspaces(memoryWorkspaces.map(({ state: _s, ...meta }) => meta));
      return;
    }
    try {
      const data = await (await apiRequest("GET", "/api/workspaces")).json();
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
      const folder = selectedFolder || null;
      if (isDeployed) {
        const now = new Date().toISOString();
        const ws = {
          id: nextMemId++,
          name,
          folder,
          createdAt: now,
          updatedAt: now,
          state: JSON.stringify(state),
        };
        memoryWorkspaces.push(ws);
        onSetActiveWorkspaceId(ws.id);
        toast({ title: "Workspace saved", description: `"${name}" created. Use Export to download.` });
      } else {
        const data = await (
          await apiRequest("POST", "/api/workspaces", {
            name,
            folder,
            state: JSON.stringify(state),
          })
        ).json();
        onSetActiveWorkspaceId(data.id);
        toast({ title: "Workspace saved", description: `"${name}" created` });
      }
      setNewName("");
      setSelectedFolder("");
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
        const data = await (await apiRequest("GET", `/api/workspaces/${ws.id}`)).json();
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

  // ── Move workspace to folder ──
  const handleMove = async (ws: WorkspaceMeta, folder: string | null) => {
    try {
      if (isDeployed) {
        const entry = memoryWorkspaces.find((w) => w.id === ws.id);
        if (entry) {
          entry.folder = folder;
          entry.updatedAt = new Date().toISOString();
        }
      } else {
        await apiRequest("POST", `/api/workspaces/${ws.id}/move`, { folder });
      }
      fetchWorkspaces();
      toast({
        title: "Moved",
        description: folder ? `"${ws.name}" → ${folder}` : `"${ws.name}" → Unfiled`,
      });
    } catch (e: any) {
      toast({ title: "Move failed", description: e.message, variant: "destructive" });
    }
  };

  // ── Rename folder ──
  const handleRenameFolder = async (oldName: string, newNameValue: string) => {
    if (!newNameValue.trim() || newNameValue.trim() === oldName) {
      setEditingFolder(null);
      return;
    }
    try {
      if (isDeployed) {
        for (const entry of memoryWorkspaces) {
          if (entry.folder === oldName) entry.folder = newNameValue.trim();
        }
      } else {
        await apiRequest("POST", "/api/workspace-folders/rename", {
          oldName,
          newName: newNameValue.trim(),
        });
      }
      setEditingFolder(null);
      setLocalFolders((prev) => prev.map((f) => (f === oldName ? newNameValue.trim() : f)));
      fetchWorkspaces();
      toast({ title: "Folder renamed", description: `"${oldName}" → "${newNameValue.trim()}"` });
    } catch (e: any) {
      toast({ title: "Rename failed", description: e.message, variant: "destructive" });
    }
  };

  // ── Delete folder ──
  const handleDeleteFolder = async (name: string) => {
    try {
      if (isDeployed) {
        for (const entry of memoryWorkspaces) {
          if (entry.folder === name) entry.folder = null;
        }
      } else {
        await apiRequest("POST", "/api/workspace-folders/delete", { name });
      }
      setLocalFolders((prev) => prev.filter((f) => f !== name));
      fetchWorkspaces();
      toast({ title: "Folder deleted", description: "Workspaces moved to Unfiled" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  // ── Create folder (local) ──
  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name || folders.includes(name)) {
      setShowNewFolder(false);
      setNewFolderName("");
      return;
    }
    setLocalFolders((prev) => [...prev, name]);
    setSelectedFolder(name);
    setShowNewFolder(false);
    setNewFolderName("");
    toast({ title: "Folder created", description: `"${name}" — move or save workspaces into it` });
  };

  // ── Export workspace as JSON file download ──
  const handleExport = (ws: WorkspaceMeta) => {
    const entry = isDeployed ? memoryWorkspaces.find((w) => w.id === ws.id) : null;
    if (isDeployed && !entry) return;

    if (isDeployed) {
      const blob = new Blob(
        [JSON.stringify({ name: ws.name, folder: ws.folder, state: JSON.parse(entry!.state) }, null, 2)],
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
            [JSON.stringify({ name: ws.name, folder: ws.folder, state }, null, 2)],
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
      const folder = parsed.folder || null;
      const state = parsed.state;
      if (!state) throw new Error("Invalid workspace file — no state found");

      if (isDeployed) {
        const now = new Date().toISOString();
        const ws = {
          id: nextMemId++,
          name,
          folder,
          createdAt: now,
          updatedAt: now,
          state: JSON.stringify(state),
        };
        memoryWorkspaces.push(ws);
        // Also immediately load it
        onLoad(state);
        onSetActiveWorkspaceId(ws.id);
        toast({ title: "Workspace imported", description: `"${name}" loaded` });
      } else {
        const data = await (
          await apiRequest("POST", "/api/workspaces", {
            name,
            folder,
            state: JSON.stringify(state),
          })
        ).json();
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
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const WorkspaceRow = ({ ws }: { ws: WorkspaceMeta }) => (
    <div
      className={`flex items-center gap-1.5 p-2 rounded text-xs border ${
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            title="Move to folder"
            data-testid={`workspace-move-${ws.id}`}
          >
            <FolderInput className="w-3 h-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[140px]">
          <DropdownMenuLabel className="text-[10px]">Move to</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {ws.folder && (
            <DropdownMenuItem
              className="text-[10px] cursor-pointer"
              onClick={() => handleMove(ws, null)}
            >
              Unfiled
            </DropdownMenuItem>
          )}
          {folders
            .filter((f) => f !== ws.folder)
            .map((f) => (
              <DropdownMenuItem
                key={f}
                className="text-[10px] cursor-pointer"
                onClick={() => handleMove(ws, f)}
              >
                {f}
              </DropdownMenuItem>
            ))}
          {folders.length === 0 && !ws.folder && (
            <div className="px-2 py-1.5 text-[10px] text-muted-foreground">No folders yet</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
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
  );

  const unfiled = workspaces.filter((w) => !w.folder);

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
      <DialogContent className="sm:max-w-[520px] max-h-[75vh] flex flex-col">
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
            className="h-8 text-xs flex-1"
            data-testid="workspace-name-input"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 text-[10px] gap-1 min-w-0 max-w-[120px]"
                title={selectedFolder || "Unfiled"}
                data-testid="workspace-folder-select"
              >
                <FolderOpen className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{selectedFolder || "Unfiled"}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              <DropdownMenuLabel className="text-[10px]">Save to folder</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className={`text-[10px] cursor-pointer ${selectedFolder ? "" : "bg-accent"}`}
                onClick={() => setSelectedFolder("")}
              >
                Unfiled
              </DropdownMenuItem>
              {folders.map((f) => (
                <DropdownMenuItem
                  key={f}
                  className={`text-[10px] cursor-pointer ${selectedFolder === f ? "bg-accent" : ""}`}
                  onClick={() => setSelectedFolder(f)}
                >
                  {f}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
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

        {/* Import + New Folder */}
        <div className="flex gap-2 items-center">
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
            Import
          </Button>
          {showNewFolder ? (
            <div className="flex items-center gap-1">
              <Input
                autoFocus
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") {
                    setShowNewFolder(false);
                    setNewFolderName("");
                  }
                }}
                className="h-7 text-xs w-[140px]"
                data-testid="workspace-new-folder-input"
              />
              <Button
                variant="default"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                <Check className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  setShowNewFolder(false);
                  setNewFolderName("");
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-3 text-xs gap-1.5"
              onClick={() => setShowNewFolder(true)}
              data-testid="workspace-new-folder-btn"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              New Folder
            </Button>
          )}
        </div>

        {/* List */}
        <div
          className="flex-1 overflow-y-auto space-y-1 mt-2 min-h-0"
          data-testid="workspace-list"
        >
          {workspaces.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No saved workspaces yet. Create one above.
            </p>
          ) : (
            <>
              {folders.map((name) => {
                const children = workspaces.filter((w) => w.folder === name);
                const collapsed = collapsedFolders.has(name);
                const isEditing = editingFolder === name;
                return (
                  <div key={name} className="mb-1" data-testid={`folder-${name}`}>
                    <div className="flex items-center gap-1 px-1 py-1 rounded hover:bg-accent/30 group">
                      <button
                        className="flex items-center gap-1 flex-1 min-w-0 text-left"
                        onClick={() => toggleFolder(name)}
                        data-testid={`folder-toggle-${name}`}
                      >
                        {collapsed ? (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                        <FolderOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                        {isEditing ? (
                          <div
                            className="flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Input
                              autoFocus
                              value={editingFolderName}
                              onChange={(e) => setEditingFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameFolder(name, editingFolderName);
                                if (e.key === "Escape") setEditingFolder(null);
                              }}
                              className="h-5 text-xs w-[120px] py-0"
                              data-testid={`folder-rename-input-${name}`}
                            />
                            <button
                              className="p-0.5 rounded hover:bg-accent"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenameFolder(name, editingFolderName);
                              }}
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button
                              className="p-0.5 rounded hover:bg-accent"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingFolder(null);
                              }}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs font-medium truncate">{name}</span>
                        )}
                        <span className="text-[10px] text-muted-foreground ml-1">
                          {children.length}
                        </span>
                      </button>
                      {!isEditing && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingFolder(name);
                              setEditingFolderName(name);
                            }}
                            title="Rename folder"
                            data-testid={`folder-rename-${name}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                          <button
                            className="p-0.5 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteFolder(name)}
                            title="Delete folder (workspaces become unfiled)"
                            data-testid={`folder-delete-${name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    {!collapsed && (
                      <div className="pl-5 space-y-1 mt-0.5">
                        {children.map((ws) => (
                          <WorkspaceRow key={ws.id} ws={ws} />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {unfiled.length > 0 && (
                <div className="mb-1" data-testid="folder-unfiled">
                  {folders.length > 0 && (
                    <div className="flex items-center gap-1 px-1 py-1">
                      <button
                        className="flex items-center gap-1 flex-1 min-w-0 text-left"
                        onClick={() => toggleFolder("__unfiled__")}
                        data-testid="folder-toggle-unfiled"
                      >
                        {collapsedFolders.has("__unfiled__") ? (
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        )}
                        <span className="text-xs font-medium text-muted-foreground">Unfiled</span>
                        <span className="text-[10px] text-muted-foreground ml-1">
                          {unfiled.length}
                        </span>
                      </button>
                    </div>
                  )}
                  {!collapsedFolders.has("__unfiled__") && (
                    <div className={folders.length > 0 ? "pl-5 space-y-1 mt-0.5" : "space-y-1"}>
                      {unfiled.map((ws) => (
                        <WorkspaceRow key={ws.id} ws={ws} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
