/** A camera device the user can select. */
export interface CameraDevice {
  deviceId: string;
  label: string;
}

/**
 * CameraService — acquires a video stream from a specific or default camera.
 * Call listCameras() first (requires a brief getUserMedia to unlock labels),
 * then start(deviceId?) to open the chosen camera.
 */
export class CameraService {
  private stream: MediaStream | null = null;
  readonly video: HTMLVideoElement;

  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.style.cssText =
      'position:absolute;width:0;height:0;opacity:0;pointer-events:none;';
    document.body.appendChild(this.video);
  }

  /**
   * Enumerate all connected video input devices.
   * The first call triggers a permission prompt if not already granted;
   * we open+immediately close a temporary stream so the browser fills in
   * the device labels (they're empty strings until permission is granted).
   */
  static async listCameras(): Promise<CameraDevice[]> {
    // Briefly open any camera to unlock device labels
    let tempStream: MediaStream | null = null;
    try {
      tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    } catch {
      // If permission denied entirely, return empty list
      return [];
    } finally {
      tempStream?.getTracks().forEach((t) => t.stop());
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'videoinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));
  }

  /**
   * Start streaming from the given deviceId.
   * If deviceId is omitted the browser picks the default camera.
   */
  async start(deviceId?: string): Promise<void> {
    // Stop existing stream if switching cameras
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }

    const videoConstraint: MediaTrackConstraints = {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30 },
    };
    if (deviceId) videoConstraint.deviceId = { exact: deviceId };

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraint,
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.video.remove();
  }

  get active(): boolean {
    return this.stream !== null;
  }

  get mediaStream(): MediaStream | null {
    return this.stream;
  }
}
