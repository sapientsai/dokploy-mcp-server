/**
 * Error helpers shared by the clients and handlers
 */

import type { FDAToolResponse } from "../types/fda.js"

/** Normalise anything thrown or rejected into an Error */
export const toError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)))

/** The tool response for a failed call */
export const failure = <T>(error: Error): FDAToolResponse<T> => ({ success: false, error: error.message })
