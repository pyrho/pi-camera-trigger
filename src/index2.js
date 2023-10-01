import Path from "path";
import {CameraList, run} from "@tsed/gphoto2-driver";

run(
  () => {
    const cameraList = new CameraList().load();

    if (cameraList.size) {
      const camera = cameraList.getCamera(0);
      const cameraFile = camera.captureImage();

      cameraFile.save(Path.join(__dirname, "capture.jpeg"));
    }
  },
  {logLevel: "debug"}
);
