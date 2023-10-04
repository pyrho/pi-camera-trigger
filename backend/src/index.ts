import 'dotenv/config'
import debounce from 'debounce'
import { access, constants, mkdir } from 'fs/promises'
import serveIndex from 'serve-index'
import express from 'express'
import net from 'net'
import fs from 'fs'
import config from './config'
import { debug, error, log } from './logger'
import cors from 'cors'
import { StatusData, getStatus } from './get-printer-status'
import { notify } from './notify'
import { mergeImages } from './merge-images'

const ONE_SECOND = 1000
const ONE_MINUTE = ONE_SECOND * 60
const TICK_RATE = 5 * ONE_MINUTE

let lastStatus: null | StatusData = null
async function startPollPrinterLoop() {
  const thisStatus = await getStatus()
  const running = thisStatus !== null && thisStatus.printer.state === 'PRINTING'
  const stateHasChanged =
    thisStatus !== null &&
    lastStatus !== null &&
    lastStatus.printer.state !== thisStatus.printer.state

  if (running) {
    lastStatus = thisStatus
    log(
      `Printing in progress... [progress:${thisStatus.job.progress}%,time_remaning:${new Date(
        thisStatus.job.time_remaining * 1000,
      )
        .toISOString()
        .substring(11, 11 + 8)}]`,
    )
    setTimeout(startPollPrinterLoop, TICK_RATE)
  }

  if (thisStatus !== null && !running && stateHasChanged && lastStatus !== null) {
    log('Print done! Notifying.')
    await notify()
    await mergeImages(`${lastStatus.job.id}`)
    log('Sleeping...')
    // Let's keep this commented out until we make sure everything works
    // await deleteImages(`${lastStatus.job.id}`)
  }

  if (!running) {
    lastStatus = thisStatus
    setTimeout(main, TICK_RATE)
    log('Sleeping...')
  }
}

function startTCPSocketServer(): void {
  const server = net.createServer()
  let connectionInProgress = false
  server.listen(config.socketServer.port, config.socketServer.host, () => {
    log(`TCP Server is running on port ${config.socketServer.port}`)
  })

  server.on('connection', function (sock) {
    let chunks: Buffer[] = []

    if (connectionInProgress) {
      error('Cannot handle multiple uploads.. Connection already in progress.')
      sock.destroy(new Error('Cannot handle multiple uploads.. Connection already in progress.'))
    }
    connectionInProgress = true

    const debouncedLog = debounce(() => log('Got data chunk...'), 1000)
    sock.on('data', function (data) {
      debouncedLog()
      chunks = [...chunks, data]
    })

    // Add a 'close' event handler to this instance of socket
    sock.on('close', async () => {
      await getStatus().then(async (status) => {
        const jobId = status?.job?.id ?? lastStatus?.job?.id ?? 'NO_JOB'
        const path = `./outputs/${jobId}`
        try {
          await access(path, constants.W_OK)
        } catch (_e) {
          await mkdir(path, { recursive: true })
        }

        debouncedLog.flush()
        log(`Merging chunks, len: ${chunks.length}`)
        fs.writeFileSync(`${path}/${+new Date()}.jpg`, Buffer.concat(chunks))
      })

      chunks = []
      sock.destroy()
      connectionInProgress = false
    })
  })
}

function startWebServer(): void {
  const app = express()

  app.use(cors())

  app.get(
    '/status',
    async (_, res) =>
      await getStatus().then((status) => {
        res.json(status)
      }),
  )
  app.use('/outputs', express.static('outputs'), serveIndex('outputs', { icons: true }))

  app.listen(config.httpServer.port)
  debug('Web server started')
}

function main(): void {
  startTCPSocketServer()
  startWebServer()
  startPollPrinterLoop()
}

main()
