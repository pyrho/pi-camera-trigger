// gphoto2.d.ts

declare module 'gphoto2' {
  export class GPhoto2 {
    constructor (options?: GPhotoOptions)

    setLogLevel (level: LogLevel): void
    // ... other methods

    list (cb: (c: Camera[]) => void): void

    on (event: 'cameraFound', listener: (camera: Camera) => void): this
    // ... other events
  }

  export interface GPhotoOptions {
    // example property
    autoDetect?: boolean
    // ... other properties
  }

  export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

  export class Camera {
    model: string
    takePicture (options?: CameraOptions, cb: (err: Error | undefined, data: Buffer) => void): void
    // ... other methods
  }

  export interface CameraOptions {
    // example property
    quality?: 'jpeg' | 'raw'
    download?: boolean
    keep?: boolean
    // ... other properties
  }

  // ... other classes, interfaces, types, etc.
}
