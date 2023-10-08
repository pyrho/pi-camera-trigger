import 'dotenv/config'
import path from 'path'
import debounce from 'debounce'
import { access, constants, mkdir } from 'fs/promises'
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
import ExpressProxy from 'express-http-proxy'

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
  const proxy = ExpressProxy

  app.use(cors())

  // Not sure if this is actually used.
  app.get(
    '/status',
    async (_, res) =>
      await getPrinterStatus().then((status) => {
        res.json(status)
      }),
  )

  app.use(express.static('public'))
  app.use('/outputs', express.static('outputs'))

  app.get('/timelapses', async (_, res) => {
    const convertImageToBase64 = async (filePath: string): Promise<string> => {
      const imageBuffer = await fs.promises.readFile(filePath)
      const base64Image = imageBuffer.toString('base64')
      return base64Image
    }

    const getDirectoriesWithTimelapses = () =>
      fs.promises
        .readdir('./outputs')
        .then((files) =>
          Promise.all(
            files.map(async (file) => {
              const directory = path.join('./outputs', file)
              const stats = await fs.promises.stat(directory)
              if (stats.isDirectory()) {
                const timelapseFile = path.join(directory, 'timelapse.mp4')
                if (fs.existsSync(timelapseFile)) return directory
              }
            }),
          ),
        )
        .then((dirs) => dirs.filter(Boolean))

    const directoriesWithTimelapses = await getDirectoriesWithTimelapses()

    return res.json(
      await Promise.all(
        directoriesWithTimelapses.map(async (dir) => ({
          name: dir,
          path: `${dir}/timelapse.mp4`,
          imgData: await convertImageToBase64(`./${dir}/thumb.png`),
        })),
      ),
    )
  })

  // Proxy PrusaLink requests to the printer
  app.use('/', proxy('mk4.lan'))

  app.listen(config.httpServer.port)
  debug(`Web server started on port ${config.httpServer.port}`)
}

function main(): void {
  startTCPSocketServer()
  startWebServer()
}

main()
