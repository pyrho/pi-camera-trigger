import config, { LOG_LEVELS } from './config'

export function log (...args: any[]): void {
  if (config.logLevel >= LOG_LEVELS.INFO) console.log(args)
}

export function debug (...args: any[]): void {
  if (config.logLevel >= LOG_LEVELS.DEBUG) console.debug(args)
}

export function error (...args: any[]): void {
  console.error(args)
}
