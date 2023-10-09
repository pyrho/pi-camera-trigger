import { request } from 'urllib'
import { debug, error, log } from './logger'
import { StatusData, getPrinterStatus } from './get-printer-status'

export async function notify(message = 'Print done!'): Promise<void> {
  return request(`http://ntfy.sh/${process.env.NTFY_TOPIC}`, {
    method: 'POST',
    data: message,
  }).then(() => {})
  // }).then(() => {
  //   bedTempNotification()
  // })
}

const TARGET_TEMP = 35

async function bedTempNotification() {
  return new Promise((resolve) => {
    const iId = setInterval(async () => {
      const printerStatus = await getPrinterStatus()
      const bedTemp = printerStatus?.printer.temp_bed
      if (bedTemp !== undefined) {
        log(`Bed temp currently at: ${bedTemp}`)
        if (bedTemp <= TARGET_TEMP) {
          clearInterval(iId)
          return resolve(notify(`Bed temp below ${TARGET_TEMP}C`))
        }
      } else {
        clearInterval(iId)
        debug('No bed temp data.')
      }
    }, 1000 * 60)
  })
}
