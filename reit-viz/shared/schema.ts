import { z } from "zod";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";

// ── Workspaces ──────────────────────────────────────────────────────────
export const workspaces = sqliteTable("workspaces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** Optional folder name for organising workspaces */
  folder: text("folder"),
  /** JSON-serialised snapshot of the entire chart state */
  state: text("state").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertWorkspaceSchema = createInsertSchema(workspaces).omit({
  id: true,
});
export type InsertWorkspace = z.infer<typeof insertWorkspaceSchema>;
export type Workspace = typeof workspaces.$inferSelect;

// ── Custom Ranking Templates ──────────────────────────────────────────
export const rankingTemplates = sqliteTable("ranking_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  /** JSON array of metric strings */
  metrics: text("metrics").notNull(),
  showRevisions: integer("show_revisions", { mode: "boolean" }).notNull().default(false),
  revMetric: text("rev_metric"),
  metricWeights: text("metric_weights"),
  metricDirections: text("metric_directions"),
  createdAt: text("created_at").notNull(),
});

export const insertRankingTemplateSchema = createInsertSchema(rankingTemplates).omit({
  id: true,
});
export type InsertRankingTemplate = z.infer<typeof insertRankingTemplateSchema>;
export type RankingTemplate = typeof rankingTemplates.$inferSelect;

// ── Custom Chart View Templates ──────────────────────────────────────
export const chartViewTemplates = sqliteTable("chart_view_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  /** JSON array of metric strings (each gets its own pane) */
  metrics: text("metrics").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertChartViewTemplateSchema = createInsertSchema(chartViewTemplates).omit({
  id: true,
});
export type InsertChartViewTemplate = z.infer<typeof insertChartViewTemplateSchema>;
export type ChartViewTemplate = typeof chartViewTemplates.$inferSelect;

// ── Saved Screener Presets ────────────────────────────────────────────
export const screenerPresets = sqliteTable("screener_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull(),
  /** JSON-serialised array of ScreenerCondition objects */
  conditions: text("conditions").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertScreenerPresetSchema = createInsertSchema(screenerPresets).omit({
  id: true,
});
export type InsertScreenerPreset = z.infer<typeof insertScreenerPresetSchema>;
export type ScreenerPreset = typeof screenerPresets.$inferSelect;

// ── Ticker metadata ────────────────────────────────────────────────────
// Ticker metadata
export const tickerMetaSchema = z.object({
  ticker: z.string(),
  name: z.string(),
  subindustry: z.string(),
  industry: z.string(),
  economy: z.string().optional(),
  sector: z.string().optional(),
  subsector: z.string().optional(),
  industryGroup: z.string().optional(),
  dates: z.number(),
  metrics: z.array(z.string()),
});

export type TickerMeta = z.infer<typeof tickerMetaSchema>;

// Ticker data (sparse encoded)
export const tickerDataSchema = z.record(z.string(), z.array(z.union([z.number(), z.string()])));
export type TickerData = z.infer<typeof tickerDataSchema>;

// Events
export const eventsSchema = z.record(z.string(), z.record(z.string(), z.array(z.string())));
export type Events = z.infer<typeof eventsSchema>;
