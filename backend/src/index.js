const net = require('net')
const fs = require('fs')
const { server: { port, host } } = require('./config')

function startTCPSocketServer () {
  const server = net.createServer()
  server.listen(port, host, () => {
    console.log('TCP Server is running on port ' + port + '.')
  })

  server.on('connection', function (sock) {
    let chunks = []

    sock.on('data', function (data) {
      chunks = [...chunks, data]
    })

    // Add a 'close' event handler to this instance of socket
    sock.on('close', () => {
      fs.writeFileSync('./test.jpg', Buffer.concat(chunks))
      chunks = []
      sock.destroy()
    })
  })
}

startTCPSocketServer()
