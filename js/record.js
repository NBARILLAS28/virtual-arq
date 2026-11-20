// Grabacion del lienzo 3D a video. Usa MP4 si el navegador lo permite (Safari,
// Chrome reciente) y WebM si no.
export class Recorder {
  constructor(canvas) { this.canvas = canvas; this.active = false; this.chunks = []; this.ext = 'webm'; }

  static pickType() {
    if (typeof MediaRecorder === 'undefined') return null;
    const list = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return list.find((t) => MediaRecorder.isTypeSupported(t)) || null;
  }

  start(fps = 30) {
    const type = Recorder.pickType();
    if (!type || !this.canvas.captureStream) return false;
    this.ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
    const stream = this.canvas.captureStream(fps);
    this.mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8_000_000 });
    this.chunks = [];
    this.mr.ondataavailable = (e) => e.data && e.data.size && this.chunks.push(e.data);
    this.mr.start(500);
    this.active = true;
    return true;
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.active) return resolve(null);
      this.mr.onstop = () => {
        this.active = false;
        const blob = new Blob(this.chunks, { type: this.mr.mimeType });
        resolve({ blob, url: URL.createObjectURL(blob), ext: this.ext });
      };
      this.mr.stop();
    });
  }
}
