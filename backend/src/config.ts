export enum LOG_LEVELS {
  OFF = 0,
  INFO = 1,
  DEBUG = 2,
}
export default {
  socketServer: { port: 3025, host: '0.0.0.0' },
  httpServer: { port: 2000, host: '0.0.0.0' },
  logLevel: LOG_LEVELS.DEBUG,
}
