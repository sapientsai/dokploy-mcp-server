import { UserError } from "fastmcp"
import type { Either } from "functype/either"
import { Left } from "functype/either"

import { ScreenId } from "../brands"
import { getDakboardClient } from "../client/dakboard-client"
import type { UpdateScreenParams } from "../types"
import { formatScreenDetail, formatScreenList } from "../utils/formatters"

export const listScreens = async (): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().listScreens()
  return result
    .mapLeft((error) => new UserError(`Failed to list screens: ${error.message}`))
    .map((screens) => formatScreenList(screens))
}

export const getScreen = async (params: { screen_id: string }): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().getScreen(ScreenId(params.screen_id))
  return result
    .mapLeft((error) => new UserError(`Failed to get screen ${params.screen_id}: ${error.message}`))
    .map((screen) => formatScreenDetail(screen))
}

export const updateScreen = async (
  params: { screen_id: string } & UpdateScreenParams,
): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const { screen_id, ...updateParams } = params
  const result = await client.orThrow().updateScreen(ScreenId(screen_id), updateParams)
  return result
    .mapLeft((error) => new UserError(`Failed to update screen ${screen_id}: ${error.message}`))
    .map((screen) => `Screen updated successfully.\n\n${formatScreenDetail(screen)}`)
}
