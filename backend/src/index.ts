import net from 'net'
import fs from 'fs'
import config from './config'
import { error, log } from './logger'

function startTCPSocketServer (): void {
  const server = net.createServer()
  let connectionInProgress = false
  server.listen(config.server.port, config.server.host, () => {
    log(`TCP Server is running on port ${config.server.port}`)
  })

  server.on('connection', function (sock) {
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
      fs.writeFileSync('./test.jpg', Buffer.concat(chunks))
      chunks = []
      sock.destroy()
      connectionInProgress = false
    })
  })
}

startTCPSocketServer()
