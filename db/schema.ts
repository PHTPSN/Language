import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
export const learners = sqliteTable("learners", {
  id: text("id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  state: text("state").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const graphProfiles = sqliteTable("graph_profiles", { id: text("id").primaryKey(), revision: integer("revision").notNull().default(0) });
export const graphNodeStates = sqliteTable("graph_node_states", {
  userId: text("user_id").notNull(), nodeId: text("node_id").notNull(), state: text("state").notNull(),
}, table => [primaryKey({ columns: [table.userId, table.nodeId] })]);
export const graphBatches = sqliteTable("graph_batches", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), baseRevision: integer("base_revision").notNull(), fingerprint: text("fingerprint").notNull(), evidence: text("evidence").notNull(), createdAt: text("created_at").notNull(),
}, table => [uniqueIndex("idx_graph_batches_revision").on(table.userId, table.baseRevision), index("idx_graph_batches_fingerprint").on(table.userId, table.fingerprint)]);
export const graphAnnotations = sqliteTable("graph_annotations", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), nodeId: text("node_id").notNull(), payload: text("payload").notNull(), createdAt: text("created_at").notNull(),
}, table => [index("idx_graph_annotations_node").on(table.userId, table.nodeId, table.createdAt)]);
