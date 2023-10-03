export const tap =
  <T>(fn: (x: T) => void) =>
  (y: T) => {
    fn(y)
    return y
  }
