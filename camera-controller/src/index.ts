import { Gpio } from 'onoff'
import config from './config'
// @ts-expect-error
import gphoto2 from 'gphoto2'

import net from 'net'

interface Camera {
  model: string
  takePicture: (o: { download?: boolean, keep?: boolean }, cb: (e: Error, data: Buffer) => void) => void
}

interface CameraDaemonInstance {
  takePicture: () => Promise<Buffer>
}

async function startCameraDaemon (): Promise<CameraDaemonInstance> {
  return await new Promise((resolve, reject) => {
    const GPhoto = new gphoto2.GPhoto2()
    GPhoto.list((listOfCameras: Camera[]) => {
      const [camera] = listOfCameras
      if (camera === undefined) return reject(new Error('No cameras found'))

      console.debug(`Found ${camera.model}, ready.`)

      return resolve({
        takePicture: async () => await new Promise((resolve, reject) => {
          console.debug('Taking picture...')
          camera.takePicture({ download: true }, (err, data) => {
            if (err !== undefined) return reject(err)
            else return resolve(data)
          })
        })
      })
    })
  })
}

async function sendPictureToWebhook (imgData: Buffer): Promise<null> {
  return await new Promise((resolve, reject) => {
    const client = net.createConnection({ host: 'mk4-rtsp.lan', port: 3025 }, () => {
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

function setupGpioHook (cameraDaemonInstance: CameraDaemonInstance): void {
  const button = new Gpio(config.gpio.pin, 'in', 'rising', { debounceTimeout: config.gpio.debounce })

  button.watch((err) => {
    if (err !== undefined) console.error(err)

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
startCameraDaemon().then(setupGpioHook).catch(console.error)
