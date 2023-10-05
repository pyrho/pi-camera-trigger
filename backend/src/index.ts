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
import { StatusData, getPrinterStatus } from './get-printer-status'
import { notify } from './notify'
import { deleteImages, mergeImages } from './merge-images'
import { match, P } from 'ts-pattern'

const ONE_SECOND = 1000
const ONE_MINUTE = ONE_SECOND * 60
const TICK_RATE = 1 * ONE_MINUTE

function getCurrentState(printerStatus: StatusData | null) {
  return match(printerStatus?.printer?.state)
    .with(P.nullish, () => 'offline' as const)
    .with('PRINTING', () => 'print in progress' as const)
    .with('FINISHED', () => 'print done' as const)
    .otherwise(() => 'unknown' as const)
}

let latestKnownJobId: number | null = null

/**
 * Set to `false` between prints.
 * Receiving data on the socket wil turn this to `true`, at this
 * point a print should be on going, so the loop will continue.
 * When the print is done the loop will exit and wait for the socket
 * to wake it up again
 */
let monitioringLoopRunning = false

async function monitoringLoop() {
  monitioringLoopRunning = true
  log('Monitoring loop running...')
  const printerStatus = await getPrinterStatus()
  latestKnownJobId = printerStatus?.job?.id ?? latestKnownJobId
  const state = getCurrentState(printerStatus)
  if (state === 'print done') {
    log('Print done!')
    if (latestKnownJobId !== null) {
      await mergeImages(`${latestKnownJobId}`)
      await deleteImages(`${latestKnownJobId}`)
    } else {
      error('Cannot create timelapse, no known jobID')
    }
    log('Notifying and exiting monitoring loop')
    await notify()
    monitioringLoopRunning = false
  } else {
    setTimeout(monitoringLoop, TICK_RATE)
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
      // Wake up
      if (!monitioringLoopRunning) {
        log('First picture taken, waking up monitoring loop...')
        monitoringLoop()
      }

      await getPrinterStatus().then(async (status) => {
        const jobId = status?.job?.id ?? latestKnownJobId ?? 'NO_JOB'
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
      await getPrinterStatus().then((status) => {
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
}

main()
