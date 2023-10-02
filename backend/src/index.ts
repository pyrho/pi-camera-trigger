import net from 'net'
import fs from 'fs'

function startTCPSocketServer () {
  const port = 3025
  const host = '0.0.0.0'

  const server = net.createServer()
  server.listen(port, host, () => {
    console.log('TCP Server is running on port ' + port + '.')
  })

  server.on('connection', (sock) => {
    let chunks: Uint8Array[] = []
    console.log('CONNECTED: ' + sock.remoteAddress + ':' + sock.remotePort)

    sock.on('data', function (data) {
      chunks = [...chunks, data]
      console.log('DATA ')
    })

    // Add a 'close' event handler to this instance of socket
    sock.on('close', () => {
      fs.writeFileSync('./test.jpg', Buffer.concat(chunks))
      chunks = []
      console.log('CLOSED')
      sock.destroy()
    })
  })
}

startTCPSocketServer()
