import { UserError } from "fastmcp"
import type { Either } from "functype/either"
import { Left } from "functype/either"

import { DeviceId } from "../brands"
import { getDakboardClient } from "../client/dakboard-client"
import type { UpdateDeviceParams } from "../types"
import { formatDeviceDetail, formatDeviceList } from "../utils/formatters"

export const listDevices = async (): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().listDevices()
  return result
    .mapLeft((error) => new UserError(`Failed to list devices: ${error.message}`))
    .map((devices) => formatDeviceList(devices))
}

export const getDevice = async (params: { device_id: string }): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().getDevice(DeviceId(params.device_id))
  return result
    .mapLeft((error) => new UserError(`Failed to get device ${params.device_id}: ${error.message}`))
    .map((device) => formatDeviceDetail(device))
}

export const updateDevice = async (
  params: { device_id: string } & UpdateDeviceParams,
): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const { device_id, ...updateParams } = params
  const result = await client.orThrow().updateDevice(DeviceId(device_id), updateParams)
  return result
    .mapLeft((error) => new UserError(`Failed to update device ${device_id}: ${error.message}`))
    .map((device) => `Device updated successfully.\n\n${formatDeviceDetail(device)}`)
}
