// @ts-ignore
import ffmpeg from 'fluent-ffmpeg'
import { opendir, readdir, unlink } from 'node:fs/promises'
import ffmpegStatic from 'ffmpeg-static'
import { tap } from './utils'
import { error, log } from './logger.js'

async function getFirstFileInDir(jobDir: string): Promise<string> {
  try {
    const dir = await opendir(`./outputs/${jobDir}`)
    for await (const dirent of dir) {
      if (dirent.isFile()) {
        return dirent.path
      }
    }
    throw new Error('Cannot find any files')
  } catch (err) {
    error(err)
    return Promise.reject(err)
  }
}

export async function mergeImages(jobDir: string): Promise<null> {
  log('Creating timelapse...')
  // We need this hack so that we can provide the `-pattern_type` input argument
  const firstFile = await getFirstFileInDir(jobDir)
  return new Promise((resolve, reject) => {
    // Tell fluent-ffmpeg where it can find FFmpeg
    ffmpeg.setFfmpegPath(ffmpegStatic)

    // Run FFmpeg
    ffmpeg(firstFile)
      // Input file
      .inputOptions('-f', 'image2')
      .inputOptions('-framerate', '24')
      .inputOptions('-pattern_type', 'glob')
      .inputOptions('-i', `./outputs/${jobDir}/*.jpg`)

      .inputOptions('-crf', '20')
      .outputOptions('-c:v', 'libx264')

      // Important for iOS playback
      .outputOptions('-pix_fmt', 'yuv420p')
      .outputOptions('-s', '1920x1280')

      // Output file
      .saveToFile(`./outputs/${jobDir}/timelapse.mp4`)
      // .saveToFile(`./output/${outputDir}/${+new Date()}.jpg`)

      // The callback that is run when FFmpeg is finished
      .on('end', () => {
        log('Timelapse created!')
        return resolve(null)
      })

      // The callback that is run when FFmpeg encountered an error
      .on('error', (error: any) => {
        return reject(error)
      })
  })
}

export async function deleteImages(jobDir: string): Promise<null> {
  return readdir(`./outputs/${jobDir}`)
    .then((entries) => entries.filter((entry) => entry.endsWith('.jpg')))
    .then(tap((entries) => log(`Cleaning up job dir ${jobDir}, ${entries.length} files...`)))
    .then((entries) => Promise.all(entries.map((entry) => unlink(`./outputs/${jobDir}/${entry}`))))
    .then(tap(() => log('Cleanup complete!')))
    .then(() => null)
}

