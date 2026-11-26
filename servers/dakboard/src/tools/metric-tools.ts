import { UserError } from "fastmcp"
import type { Either } from "functype/either"
import { Left } from "functype/either"

import { MetricName } from "../brands"
import { getDakboardClient } from "../client/dakboard-client"
import type { CreateDataPointParams, DeleteDataPointsParams } from "../types"
import { formatMetricDetail, formatMetricList } from "../utils/formatters"

export const listMetrics = async (): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().listMetrics()
  return result
    .mapLeft((error) => new UserError(`Failed to list metrics: ${error.message}`))
    .map((metrics) => formatMetricList(metrics))
}

export const getMetric = async (params: { metric_name: string }): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().getMetric(MetricName(params.metric_name))
  return result
    .mapLeft((error) => new UserError(`Failed to get metric ${params.metric_name}: ${error.message}`))
    .map((metric) => formatMetricDetail(metric))
}

export const createMetricDataPoints = async (params: {
  metric_name: string
  data_points: CreateDataPointParams[]
}): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().createMetricDataPoints(MetricName(params.metric_name), params.data_points)
  return result
    .mapLeft(
      (error) => new UserError(`Failed to create data points for metric ${params.metric_name}: ${error.message}`),
    )
    .map(() => `Successfully created ${params.data_points.length} data point(s) for metric "${params.metric_name}".`)
}

export const deleteMetric = async (params: { metric_name: string }): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const result = await client.orThrow().deleteMetric(MetricName(params.metric_name))
  return result
    .mapLeft((error) => new UserError(`Failed to delete metric ${params.metric_name}: ${error.message}`))
    .map(() => `Metric "${params.metric_name}" has been deleted.`)
}

export const deleteMetricDataPoints = async (params: {
  metric_name: string
  timestamp: string
}): Promise<Either<UserError, string>> => {
  const client = getDakboardClient()
  if (client.isNone()) return Left(new UserError("DAKboard client not initialized. Check DAKBOARD_API_KEY."))

  const deleteParams: DeleteDataPointsParams = { timestamp: params.timestamp }
  const result = await client.orThrow().deleteMetricDataPoints(MetricName(params.metric_name), deleteParams)
  return result
    .mapLeft(
      (error) => new UserError(`Failed to delete data points for metric ${params.metric_name}: ${error.message}`),
    )
    .map(() => `Data points at timestamp "${params.timestamp}" deleted from metric "${params.metric_name}".`)
}
