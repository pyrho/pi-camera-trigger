import 'dotenv/config'
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
    // await capture(`${thisStatus.job.id}`)
    setTimeout(startPollPrinterLoop, TICK_RATE)
  }

  if (thisStatus !== null && !running && stateHasChanged && lastStatus !== null) {
    log('Print done! Notifying.')
    notify()
    await mergeImages(`${lastStatus.job.id}`)
    // await deleteImages(`${lastStatus.job.id}`)
  }

  if (!running) {
    lastStatus = thisStatus
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
    // Wake up !
    startPollPrinterLoop()

    let chunks: Buffer[] = []

    if (connectionInProgress) {
      error('Cannot handle multiple uploads.. Connection already in progress.')
      sock.destroy(new Error('Cannot handle multiple uploads.. Connection already in progress.'))
    }
    connectionInProgress = true

    sock.on('data', function (data) {
      chunks = [...chunks, data]
    })

    // Add a 'close' event handler to this instance of socket
    sock.on('close', () => {
      getStatus().then((status) => {
        const jobId = status?.job?.id ?? lastStatus?.job?.id ?? 'NO_JOB'
        fs.writeFileSync(`./outputs/${jobId}/test.jpg`, Buffer.concat(chunks))
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
