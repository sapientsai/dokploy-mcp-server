import { Map } from "functype"

import type { DakboardBlock } from "../types"

const GRID_W = 76
const GRID_H = 24

export type BlockPercentages = {
  pctX: number
  pctY: number
  pctW: number
  pctH: number
}

type NormalizedBlock = {
  gx: number
  gy: number
  gw: number
  gh: number
  label: string
  isDisabled: boolean
  zIndex: number
  id: string
  isBackground: boolean
}

const ZERO_PCT: BlockPercentages = { pctX: 0, pctY: 0, pctW: 0, pctH: 0 }

const truncateLabel = (label: string, maxWidth: number): string => {
  if (label.length <= maxWidth) return label
  if (maxWidth >= 4) return `${label.substring(0, maxWidth - 1)}~`
  if (maxWidth >= 1) return label.substring(0, maxWidth)
  return ""
}

const blockLabel = (block: DakboardBlock): string => (block.name != null && block.name !== "" ? block.name : block.type)

const normalizeFromPercentages = (blocks: DakboardBlock[], pctMap: Map<string, BlockPercentages>): NormalizedBlock[] =>
  blocks.map((block) =>
    pctMap.get(block.id).fold(
      (): NormalizedBlock => ({
        gx: 0,
        gy: 0,
        gw: 0,
        gh: 0,
        label: blockLabel(block),
        isDisabled: block.is_disabled === 1,
        zIndex: block.z_index,
        id: block.id,
        isBackground: false,
      }),
      (pct): NormalizedBlock => {
        const gx = Math.min(Math.round((pct.pctX / 100) * GRID_W), GRID_W - 2)
        const gy = Math.min(Math.round((pct.pctY / 100) * GRID_H), GRID_H - 2)
        const gw = Math.max(2, Math.round((pct.pctW / 100) * GRID_W))
        const gh = Math.max(2, Math.round((pct.pctH / 100) * GRID_H))
        const isBg = pct.pctW > 95 && pct.pctH > 95

        return {
          gx,
          gy,
          gw: Math.min(gw, GRID_W - gx),
          gh: Math.min(gh, GRID_H - gy),
          label: blockLabel(block),
          isDisabled: block.is_disabled === 1,
          zIndex: block.z_index,
          id: block.id,
          isBackground: isBg,
        }
      },
    ),
  )

const normalizeFromCoordinates = (blocks: DakboardBlock[]): NormalizedBlock[] => {
  const canvasW = Math.max(...blocks.map((b) => b.x + b.w))
  const canvasH = Math.max(...blocks.map((b) => b.y + b.h))
  if (canvasW === 0 || canvasH === 0) return []

  const scaleX = GRID_W / canvasW
  const scaleY = GRID_H / canvasH

  return blocks.map((block) => {
    const gx = Math.min(Math.round(block.x * scaleX), GRID_W - 2)
    const gy = Math.min(Math.round(block.y * scaleY), GRID_H - 2)
    const gw = Math.max(2, Math.round(block.w * scaleX))
    const gh = Math.max(2, Math.round(block.h * scaleY))
    const isBg = gw * gh >= GRID_W * GRID_H * 0.9

    return {
      gx,
      gy,
      gw: Math.min(gw, GRID_W - gx),
      gh: Math.min(gh, GRID_H - gy),
      label: blockLabel(block),
      isDisabled: block.is_disabled === 1,
      zIndex: block.z_index,
      id: block.id,
      isBackground: isBg,
    }
  })
}

/* eslint-disable functype/no-imperative-loops, functype/no-let -- 2D character-grid drawing is inherently imperative */
const drawBlock = (grid: string[][], gx: number, gy: number, gw: number, gh: number, isDisabled: boolean): void => {
  const hEdge = isDisabled ? "╌" : "─"
  const vEdge = isDisabled ? "╎" : "│"

  grid[gy][gx] = "┌"
  for (let c = gx + 1; c < gx + gw - 1; c++) grid[gy][c] = hEdge
  grid[gy][gx + gw - 1] = "┐"

  grid[gy + gh - 1][gx] = "└"
  for (let c = gx + 1; c < gx + gw - 1; c++) grid[gy + gh - 1][c] = hEdge
  grid[gy + gh - 1][gx + gw - 1] = "┘"

  for (let r = gy + 1; r < gy + gh - 1; r++) {
    grid[r][gx] = vEdge
    grid[r][gx + gw - 1] = vEdge
  }
}

const renderGrid = (
  normalized: NormalizedBlock[],
): { diagram: string; legendEntries: { key: string; label: string; isDisabled: boolean }[] } => {
  normalized.sort((a, b) => a.zIndex - b.zIndex || a.id.localeCompare(b.id))

  const grid: string[][] = Array.from({ length: GRID_H }, () => Array.from({ length: GRID_W }, () => " "))
  const legendEntries: { key: string; label: string; isDisabled: boolean }[] = []
  let keyCounter = 0

  for (const nb of normalized) {
    if (nb.gw < 2 || nb.gh < 2) continue

    drawBlock(grid, nb.gx, nb.gy, nb.gw, nb.gh, nb.isDisabled)

    const fillChar = nb.isBackground ? "·" : " "
    for (let r = nb.gy + 1; r < nb.gy + nb.gh - 1; r++) {
      for (let c = nb.gx + 1; c < nb.gx + nb.gw - 1; c++) {
        grid[r][c] = fillChar
      }
    }

    const interiorW = nb.gw - 2
    const interiorH = nb.gh - 2
    const displayLabel = nb.isDisabled ? `${nb.label} X` : nb.label

    if (interiorW < 2 || interiorH < 1) {
      const key = String.fromCharCode(65 + keyCounter)
      keyCounter++
      legendEntries.push({ key, label: nb.label, isDisabled: nb.isDisabled })
      if (interiorH >= 1 && interiorW >= 1) {
        grid[nb.gy + 1][nb.gx + 1] = key
      }
    } else {
      const truncated = truncateLabel(displayLabel, interiorW)
      if (truncated.length > 0) {
        const labelRow = nb.gy + 1
        const startCol = nb.gx + 1 + Math.floor((interiorW - truncated.length) / 2)
        for (let i = 0; i < truncated.length; i++) {
          grid[labelRow][startCol + i] = truncated[i]
        }
      }
    }
  }
  /* eslint-enable functype/no-imperative-loops, functype/no-let */

  const diagram = grid.map((row) => row.join("").trimEnd()).join("\n")
  return { diagram, legendEntries }
}

export const parseScreenPagePercentages = (html: string): Map<string, BlockPercentages> => {
  const blockRegex =
    /id="([a-f0-9]{24,})"[^>]*style="[^"]*--block-width:\s*([\d.]+)%[^"]*--block-height:\s*([\d.]+)%[^"]*--block-x:\s*([\d.]+)%[^"]*--block-y:\s*([\d.]+)%/g

  const entries = Array.from(html.matchAll(blockRegex), (m): [string, BlockPercentages] => [
    m[1],
    {
      pctW: parseFloat(m[2]),
      pctH: parseFloat(m[3]),
      pctX: parseFloat(m[4]),
      pctY: parseFloat(m[5]),
    },
  ])

  return Map(entries)
}

export const formatBlockLayout = (
  blocks: DakboardBlock[],
  pctMap: Map<string, BlockPercentages> = Map.empty<string, BlockPercentages>(),
): string => {
  if (blocks.length === 0) return "No blocks to visualize."

  const idMap = Map(blocks.map((b): [string, string] => [b.id, b.id.startsWith("blk_") ? b.id.slice(4) : b.id]))

  const hasPct = !pctMap.isEmpty
  const normalized = hasPct
    ? normalizeFromPercentages(
        blocks,
        Map(
          blocks.map((b): [string, BlockPercentages] => [
            b.id,
            pctMap.get(idMap.get(b.id).orElse(b.id)).orElse(ZERO_PCT),
          ]),
        ),
      )
    : normalizeFromCoordinates(blocks)

  if (normalized.length === 0) return "No blocks to visualize."

  const { diagram, legendEntries } = renderGrid(normalized)

  const legend =
    legendEntries.length > 0
      ? `\n\nLegend:\n${legendEntries
          .map((e) => `  ${e.key} = ${e.label}${e.isDisabled ? " [Disabled]" : ""}`)
          .join("\n")}`
      : ""

  const disabledCount = blocks.filter((b) => b.is_disabled === 1).length
  const disabledNote = disabledCount > 0 ? ` | ${disabledCount} disabled (dashed borders)` : ""
  const modeNote = hasPct ? " (CSS percentages)" : " (API coordinates)"
  const summary = `\n\nLayout: ${blocks.length} blocks${modeNote}${disabledNote}`

  const pixelTable = hasPct
    ? `\n\n## Block Positions (use these values with update_block)\n${blocks
        .map((b) =>
          pctMap.get(idMap.get(b.id).orElse(b.id)).fold(
            () => null,
            (pct) => {
              const px = {
                x: Math.round((pct.pctX / 100) * 1920),
                y: Math.round((pct.pctY / 100) * 1080),
                w: Math.round((pct.pctW / 100) * 1920),
                h: Math.round((pct.pctH / 100) * 1080),
              }
              const label = blockLabel(b)
              const disabled = b.is_disabled === 1 ? " [Disabled]" : ""
              return `- **${label}**${disabled} (${b.id}): x=${px.x}, y=${px.y}, w=${px.w}, h=${px.h}`
            },
          ),
        )
        .filter((line): line is string => line != null)
        .join("\n")}`
    : ""

  return diagram + legend + summary + pixelTable
}
