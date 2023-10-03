import { Gpio } from 'onoff'
import gphoto2 from 'gphoto2'
import net from 'net'

import config from './config'

interface CameraDaemon {
  takePicture: () => Promise<Buffer>
}

async function startCameraDaemon (): Promise<CameraDaemon> {
  return await new Promise((resolve, reject) => {
    const GPhoto = new gphoto2.GPhoto2()
    GPhoto.list((listOfCameras) => {
      const [camera] = listOfCameras
      if (camera === undefined) return reject(new Error('No cameras found'))

      console.debug(`Found ${camera.model}, ready.`)

      return resolve({
        takePicture: async () => await new Promise((resolve, reject) => {
          console.debug('Taking picture...')
          camera.takePicture({ download: true }, (err, data) => {
            if (err != null) return reject(err)
            else return resolve(data)
          })
        })
      })
    })
  })
}

async function sendPictureToWebhook (imgData: Buffer): Promise<null> {
  return await new Promise((resolve, reject) => {
    const client = net.createConnection({ ...config.socket }, () => {
      console.log('Connected to server')
      client.write(imgData, err => {
        if (err != null) {
          return reject(err)
        } else {
          client.end()
          return resolve(null)
        }
      })
    })
  })
}

function setupGpioHook (cameraDaemonInstance: CameraDaemon): void {
  const button = new Gpio(config.gpio.pin, 'in', 'rising', { debounceTimeout: config.gpio.debounce })

  button.watch((err) => {
    if (err != null) console.error(`GPIO error: ${err.message}`)

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

startCameraDaemon()
  .then(setupGpioHook)
  .catch(console.error)
