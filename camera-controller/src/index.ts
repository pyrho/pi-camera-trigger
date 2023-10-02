import { Gpio } from 'onoff'
import net from 'net'
import config from './config'
// @ts-ignore
import gphoto2  from 'gphoto2';


type Camera = {
    model: string
    takePicture: (args: {download?: boolean; keep?: boolean}, cb: (e: Error, d: Uint8Array) => void)  => void
}

type CameraDaemon = {
    takePicture: () => Promise<Uint8Array>
}

function startCameraDaemon (): Promise<CameraDaemon> {
  return new Promise((resolve, reject) => {
    const GPhoto = new gphoto2.GPhoto2()
    GPhoto.list((listOfCameras: Camera[]) => {
      const [camera] = listOfCameras
      if (!camera) return reject(new Error('No cameras found'))

      console.debug(`Found ${camera.model}, ready.`)

      return resolve({
        takePicture: () => new Promise<Uint8Array>((resolve, reject) => {
          console.debug('Taking picture...')
          camera.takePicture({ download: true }, (err, data) => {
            if (err) return reject(err)
            else return resolve(data)
          })
        })
      } as CameraDaemon)
    })
  })
}

function sendPictureToWebhook (imgData: Uint8Array) {
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

function setupGpioHook (cameraDaemonInstance: CameraDaemon) {
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

startCameraDaemon().then(setupGpioHook)
