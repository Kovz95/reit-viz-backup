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
}

export const storage = new DatabaseStorage();
