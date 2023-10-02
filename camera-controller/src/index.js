const Gpio = require('onoff').Gpio
const config = require('./config')
const axios = require('axios')
const gphoto2 = require('gphoto2')
const net = require('net')

function startCameraDaemon () {
  return new Promise((resolve, reject) => {
    const GPhoto = new gphoto2.GPhoto2()
    GPhoto.list(listOfCameras => {
      const [camera] = listOfCameras
      if (!camera) return reject(new Error('No cameras found'))

      console.debug(`Found ${camera.model}, ready.`)

      return resolve({
        takePicture: () => new Promise((resolve, reject) => {
          console.debug('Taking picture...')
          camera.takePicture({ download: true }, (err, data) => {
            if (err) return reject(err)
            else return resolve(data)
          })
        })
      })
    })
  })
}

/**
  * @param {Buffer} imgData - JSDocs on property assignments work
  * @returns {Promise<null>}
   */
function sendPictureToWebhook (imgData) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ host: 'mk4-rtsp.lan', port: 3025 }, () => {
      console.log('Connected to server')
      client.write(imgData, err => {
        if (err) {
          return reject(err)
        } else {
          client.end()
          return resolve(null)
        }
      })
    })
  })
}

function setupGpioHook (cameraDaemonInstance) {
  const button = new Gpio(config.gpio.pin, 'in', 'rising', { debounceTimeout: config.gpio.debounce })

  button.watch((err) => {
    if (err) console.error(`GPIO error: ${err}`)

    console.debug('Button pressed')

    cameraDaemonInstance.takePicture()
      .then(sendPictureToWebhook)
      .then(() => {
        console.log('Image posted successfully!')
      })
      .catch((error) => {
        console.error('Error downloading the image:', error)
      })
  })
  // Cleanup
  process.on('SIGINT', _ => {
    button.unexport()
  })

  console.log('Daemon running')
}

// Example usage

// function main () {
//   const button = new Gpio(3, 'in', 'rising', { debounceTimeout: 10 })
//
//   button.watch((err, value) => {
//     console.log('Button pressed yo!' + value)
//
//     const imageUrl = 'http://mk4-spy:8080/snapshot?max_delay=0' // Replace with your temporary image URL
//     const outputPath = `shots/${+new Date()}.jpg` // Replace with your desired output path
//
//     downloadFromDslr()
//     // downloadImage(imageUrl, outputPath)
//       .then(() => {
//         console.log('Image downloaded successfully!')
//       })
//       .catch((error) => {
//         console.error('Error downloading the image:', error)
//       })
//   })
//   // Cleanup
//   process.on('SIGINT', _ => {
//     button.unexport()
//   })
//
//   console.log('Daemon running')
// }

startCameraDaemon().then(setupGpioHook)
// main()
