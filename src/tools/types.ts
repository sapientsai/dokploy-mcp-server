import type { SomaServerInstance } from "somamcp"

/**
 * Minimal server interface each register function depends on.
 * Narrowed from SomaServerInstance so tools stay decoupled from the full backend surface.
 */
export type ToolServer = Pick<SomaServerInstance, "addTool">
