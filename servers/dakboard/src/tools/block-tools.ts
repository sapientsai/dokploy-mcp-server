import { UserError } from "fastmcp"
import { Map, Option } from "functype"
import type { Either } from "functype/either"
import { Left, Right } from "functype/either"
import { Try } from "functype/try"

import { BlockId, ScreenId } from "../brands"
import { getDakboardClient } from "../client/dakboard-client"
import type { UpdateBlockParams } from "../types"
import { formatBlockDetail, formatBlockList } from "../utils/formatters"
import type { BlockPercentages } from "../utils/layout"
import { formatBlockLayout, parseScreenPagePercentages } from "../utils/layout"

export const listBlocks = async (params: { screen_id: string }): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().listBlocks(ScreenId(params.screen_id))
  return result
    .mapLeft((error) => new UserError(`Failed to list blocks for screen ${params.screen_id}: ${error.message}`))
    .map((blocks) => formatBlockList(blocks, params.screen_id))
}

export const getBlock = async (params: { screen_id: string; block_id: string }): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().getBlock(ScreenId(params.screen_id), BlockId(params.block_id))
  return result
    .mapLeft((error) => new UserError(`Failed to get block ${params.block_id}: ${error.message}`))
    .map((block) => formatBlockDetail(block))
}

export const updateBlock = async (
  params: { screen_id: string; block_id: string } & UpdateBlockParams,
): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const { screen_id, block_id, ...updateParams } = params
  const result = await client.orThrow().updateBlock(ScreenId(screen_id), BlockId(block_id), updateParams)
  return result
    .mapLeft((error) => new UserError(`Failed to update block ${block_id}: ${error.message}`))
    .map((block) => `Block updated successfully.\n\n${formatBlockDetail(block)}`)
}

const fetchScreenPercentages = async (screenUuid: string): Promise<Map<string, BlockPercentages>> => {
  const url = `https://dakboard.com/screen/uuid/${screenUuid}`
  const result = Try(() => fetch(url))
  if (result.isFailure()) return Map.empty<string, BlockPercentages>()

  // eslint-disable-next-line functype/prefer-either -- boundary: fetch throws
  try {
    const response = await result.orThrow()
    if (!response.ok) return Map.empty<string, BlockPercentages>()
    const html = await response.text()
    return parseScreenPagePercentages(html)
  } catch {
    return Map.empty<string, BlockPercentages>()
  }
}

export const visualizeLayout = async (params: {
  screen_id: string
  screen_uuid?: string
}): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const blocksResult = await client.orThrow().listBlocks(ScreenId(params.screen_id))
  if (blocksResult.isLeft()) {
    return Left(
      new UserError(
        `Failed to get layout for screen ${params.screen_id}: ${blocksResult.fold(
          (e) => e.message,
          () => "",
        )}`,
      ),
    )
  }

  const blocks = blocksResult.orThrow()
  const pctMap = await Option(params.screen_uuid).fold(
    () => Promise.resolve(Map.empty<string, BlockPercentages>()),
    fetchScreenPercentages,
  )
  return Right(formatBlockLayout(blocks, pctMap))
}
