import { request } from 'urllib'

export function notify(): Promise<void> {
  return request(`http://ntfy.sh/${process.env.NTFY_TOPIC}`, {
    method: 'POST',
    data: 'Print done!',
  }).then(() =>{})
}
