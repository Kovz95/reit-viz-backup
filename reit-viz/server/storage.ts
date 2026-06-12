import {
  workspaces, type Workspace, type InsertWorkspace,
  rankingTemplates, type RankingTemplate, type InsertRankingTemplate,
  chartViewTemplates, type ChartViewTemplate, type InsertChartViewTemplate,
  screenerPresets, type ScreenerPreset, type InsertScreenerPreset,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, desc, asc } from "drizzle-orm";

const sqlite = new Database("data.db");
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

// ── Ensure tables exist ─────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    folder     TEXT,
    state      TEXT    NOT NULL,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );
`);

// Migration: add folder column if missing (existing DBs)
try {
  sqlite.exec(`ALTER TABLE workspaces ADD COLUMN folder TEXT;`);
} catch (_e) {
  // Column already exists — ignore
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS screener_presets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT    NOT NULL,
    conditions TEXT    NOT NULL,
    created_at TEXT    NOT NULL
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS chart_view_templates (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT    NOT NULL,
    metrics    TEXT    NOT NULL,
    created_at TEXT    NOT NULL
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS ranking_templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    label          TEXT    NOT NULL,
    metrics        TEXT    NOT NULL,
    show_revisions INTEGER NOT NULL DEFAULT 0,
    rev_metric     TEXT,
    created_at     TEXT    NOT NULL
  );
`);

export interface IStorage {
  listWorkspaces(): Workspace[];
  getWorkspace(id: number): Workspace | undefined;
  createWorkspace(ws: InsertWorkspace): Workspace;
  updateWorkspace(id: number, ws: Partial<InsertWorkspace>): Workspace | undefined;
  deleteWorkspace(id: number): boolean;

  listRankingTemplates(): RankingTemplate[];
  createRankingTemplate(t: InsertRankingTemplate): RankingTemplate;
  deleteRankingTemplate(id: number): boolean;

  listChartViewTemplates(): ChartViewTemplate[];
  createChartViewTemplate(t: InsertChartViewTemplate): ChartViewTemplate;
  deleteChartViewTemplate(id: number): boolean;

  listScreenerPresets(): ScreenerPreset[];
  createScreenerPreset(p: InsertScreenerPreset): ScreenerPreset;
  deleteScreenerPreset(id: number): boolean;

  listMAOptimizerPresets(): any[];
  createMAOptimizerPreset(preset: any): any;
  deleteMAOptimizerPreset(id: number): boolean;

  listCustomCharts(): any[];
  getCustomChart(id: number): any | undefined;
  createCustomChart(chart: any): any;
  updateCustomChart(id: number, updates: any): any | undefined;
  deleteCustomChart(id: number): boolean;

  listAlerts(): any[];
  createAlert(alert: any): any;
  updateAlert(id: number, updates: any): any | undefined;
  deleteAlert(id: number): boolean;

  listAnnotations(): any[];
  createAnnotation(annotation: any): any;
  updateAnnotation(id: number, updates: any): any | undefined;
  deleteAnnotation(id: number): boolean;
}

export class DatabaseStorage implements IStorage {
  listWorkspaces(): Workspace[] {
    return db.select().from(workspaces).orderBy(desc(workspaces.updatedAt)).all();
  }

  getWorkspace(id: number): Workspace | undefined {
    return db.select().from(workspaces).where(eq(workspaces.id, id)).get();
  }

  createWorkspace(ws: InsertWorkspace): Workspace {
    return db.insert(workspaces).values(ws).returning().get();
  }

  updateWorkspace(id: number, ws: Partial<InsertWorkspace>): Workspace | undefined {
    const existing = this.getWorkspace(id);
    if (!existing) return undefined;
    return db
      .update(workspaces)
      .set({ ...ws, updatedAt: new Date().toISOString() })
      .where(eq(workspaces.id, id))
      .returning()
      .get();
  }

  deleteWorkspace(id: number): boolean {
    const result = db.delete(workspaces).where(eq(workspaces.id, id)).run();
    return result.changes > 0;
  }

  // ── Ranking Templates ──
  listRankingTemplates(): RankingTemplate[] {
    return db.select().from(rankingTemplates).orderBy(asc(rankingTemplates.label)).all();
  }

  createRankingTemplate(t: InsertRankingTemplate): RankingTemplate {
    return db.insert(rankingTemplates).values(t).returning().get();
  }

  deleteRankingTemplate(id: number): boolean {
    const result = db.delete(rankingTemplates).where(eq(rankingTemplates.id, id)).run();
    return result.changes > 0;
  }

  // ── Screener Presets ──
  listScreenerPresets(): ScreenerPreset[] {
    return db.select().from(screenerPresets).orderBy(asc(screenerPresets.label)).all();
  }

  createScreenerPreset(p: InsertScreenerPreset): ScreenerPreset {
    return db.insert(screenerPresets).values(p).returning().get();
  }

  deleteScreenerPreset(id: number): boolean {
    const result = db.delete(screenerPresets).where(eq(screenerPresets.id, id)).run();
    return result.changes > 0;
  }

  // ── Chart View Templates ──
  listChartViewTemplates(): ChartViewTemplate[] {
    return db.select().from(chartViewTemplates).orderBy(asc(chartViewTemplates.label)).all();
  }

  createChartViewTemplate(t: InsertChartViewTemplate): ChartViewTemplate {
    return db.insert(chartViewTemplates).values(t).returning().get();
  }

  deleteChartViewTemplate(id: number): boolean {
    const result = db.delete(chartViewTemplates).where(eq(chartViewTemplates.id, id)).run();
    return result.changes > 0;
  }

  // ── MA Optimizer Presets (stub — table created on demand) ──
  listMAOptimizerPresets(): any[] {
    try {
      return (sqlite.prepare("SELECT * FROM ma_optimizer_presets ORDER BY created_at DESC").all() as any[]);
    } catch { return []; }
  }
  createMAOptimizerPreset(preset: any): any {
    try {
      const stmt = sqlite.prepare("INSERT INTO ma_optimizer_presets (label, config, created_at) VALUES (?, ?, ?) RETURNING *");
      return stmt.get(preset.label, preset.config, preset.createdAt) ?? preset;
    } catch { return { ...preset, id: Date.now() }; }
  }
  deleteMAOptimizerPreset(id: number): boolean {
    try {
      const r = sqlite.prepare("DELETE FROM ma_optimizer_presets WHERE id = ?").run(id);
      return r.changes > 0;
    } catch { return false; }
  }

  // ── Custom Charts ──
  listCustomCharts(): any[] {
    try {
      return (sqlite.prepare("SELECT * FROM custom_charts ORDER BY updated_at DESC").all() as any[]);
    } catch { return []; }
  }
  getCustomChart(id: number): any | undefined {
    try {
      return sqlite.prepare("SELECT * FROM custom_charts WHERE id = ?").get(id) ?? undefined;
    } catch { return undefined; }
  }
  createCustomChart(chart: any): any {
    try {
      const stmt = sqlite.prepare("INSERT INTO custom_charts (name, state, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING *");
      return stmt.get(chart.name, chart.state, chart.createdAt, chart.updatedAt) ?? chart;
    } catch { return { ...chart, id: Date.now() }; }
  }
  updateCustomChart(id: number, updates: any): any | undefined {
    try {
      const existing: any = this.getCustomChart(id);
      if (!existing) return undefined;
      const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      sqlite.prepare("UPDATE custom_charts SET name = ?, state = ?, updated_at = ? WHERE id = ?").run(merged.name, merged.state, merged.updatedAt, id);
      return merged;
    } catch { return undefined; }
  }
  deleteCustomChart(id: number): boolean {
    try {
      return sqlite.prepare("DELETE FROM custom_charts WHERE id = ?").run(id).changes > 0;
    } catch { return false; }
  }

  // ── Alerts ──
  listAlerts(): any[] {
    try {
      return (sqlite.prepare("SELECT * FROM alerts ORDER BY created_at DESC").all() as any[]);
    } catch { return []; }
  }
  createAlert(alert: any): any {
    try {
      const now = new Date().toISOString();
      const stmt = sqlite.prepare("INSERT INTO alerts (ticker, metric, operator, threshold, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *");
      return stmt.get(alert.ticker, alert.metric, alert.operator, alert.threshold, alert.label ?? '', now, now) ?? alert;
    } catch { return { ...alert, id: Date.now() }; }
  }
  updateAlert(id: number, updates: any): any | undefined {
    try {
      const existing: any = sqlite.prepare("SELECT * FROM alerts WHERE id = ?").get(id);
      if (!existing) return undefined;
      const merged = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      return merged;
    } catch { return undefined; }
  }
  deleteAlert(id: number): boolean {
    try {
      return sqlite.prepare("DELETE FROM alerts WHERE id = ?").run(id).changes > 0;
    } catch { return false; }
  }

  // ── Annotations ──
  listAnnotations(): any[] {
    try {
      return (sqlite.prepare("SELECT * FROM annotations ORDER BY created_at DESC").all() as any[]);
    } catch { return []; }
  }
  createAnnotation(annotation: any): any {
    try {
      return { ...annotation, id: Date.now() };
    } catch { return annotation; }
  }
  updateAnnotation(id: number, updates: any): any | undefined {
    try {
      return { id, ...updates };
    } catch { return undefined; }
  }
  deleteAnnotation(id: number): boolean {
    try {
      return sqlite.prepare("DELETE FROM annotations WHERE id = ?").run(id).changes > 0;
    } catch { return false; }
  }
}

export const storage = new DatabaseStorage();
