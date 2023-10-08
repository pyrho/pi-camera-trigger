import { Gpio } from 'onoff'
import gphoto2, { Camera } from 'gphoto2'
import net from 'net'
import config from './config'
import { debug, error, log } from './logger'

const takePicture = (() => {
  let cameraInstance: Camera | null = null

  const getCamera = () =>
    new Promise<Camera>((resolve, reject) => {
      if (cameraInstance === null) {
        new gphoto2.GPhoto2().list((cameras) => {
          const [camera] = cameras
          if (camera === undefined) return reject(new Error('No cameras found'))
          debug(`Found ${camera.model}, ready.`)
          cameraInstance = camera
          return resolve(cameraInstance)
        })
      } else {
        return resolve(cameraInstance)
      }
    })

  // Get the camera at load time to speed up the first picture
  getCamera().then(() => debug('Camera initialized at load time'))

  const takePicture = (retried = false) =>
    new Promise<Buffer>((resolve, reject) => {
      debug('Taking picture...')
      getCamera().then((camera) =>
        camera.takePicture({ download: true }, (err, data) => {
          if (err !== null && err !== undefined) {
            // In the "normal" case, this will happen
            // if the camera is disconnected
            // Setting `cameraInstance` to null will force a reinstantiation
            // of the camera
            cameraInstance = null
            // Retry once
            if (!retried) return takePicture(true)
            return reject(err)
          } else {
            return resolve(data)
          }
        }),
      )
    })
  return takePicture
})()

async function sendPictureToWebhook(imgData: Buffer): Promise<void> {
  return await new Promise((resolve, reject) => {
    const client = net.createConnection({ ...config.socket }, () => {
      debug('Connected to server')
      client.on('error', (e) => reject(e))
      client.write(imgData, (err) => {
        if (err != null) {
          return reject(err)
        } else {
          client.end()
          return resolve()
        }
      })
    })
  })
}

function setupGpioHook(): void {
  const button = new Gpio(config.gpio.pin, 'in', 'rising', {
    debounceTimeout: config.gpio.debounce,
  })

  button.watch((err) => {
    if (err != null) error(`GPIO error: ${err.message}`)

    debug('Button pressed')

    takePicture()
      .then(sendPictureToWebhook)
      .then(() => log('Image posted successfully!'))
      .catch((e) => error('Error downloading the image:', e))
  })

  // Cleanup
  process.on('SIGINT', (_) => {
    button.unexport()
  })

  log('Daemon running')
}

setupGpioHook()
