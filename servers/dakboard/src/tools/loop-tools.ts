import { UserError } from "fastmcp"
import type { Either } from "functype/either"
import { Left } from "functype/either"

import { LoopId } from "../brands"
import { getDakboardClient } from "../client/dakboard-client"
import { formatLoopDetail, formatLoopList } from "../utils/formatters"

export const listLoops = async (): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().listLoops()
  return result
    .mapLeft((error) => new UserError(`Failed to list loops: ${error.message}`))
    .map((loops) => formatLoopList(loops))
}

export const getLoop = async (params: { loop_id: string }): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().getLoop(LoopId(params.loop_id))
  return result
    .mapLeft((error) => new UserError(`Failed to get loop ${params.loop_id}: ${error.message}`))
    .map((loop) => formatLoopDetail(loop))
}
