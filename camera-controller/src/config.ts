export enum LOG_LEVELS {
  DEBUG = 5,
  INFO = 4,
  NONE = 0,
}

export default {
  logLevel: 1,
  gpio: { pin: 3, debounce: 10 },
  socket: {
    port: 3025,
    host: 'mk4-rtsp.lan'
  }
}
