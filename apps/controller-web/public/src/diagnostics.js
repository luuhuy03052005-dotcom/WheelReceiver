export class DiagnosticsTracker {
  constructor() {
    this.rttMs = 0;
    this.packetCount = 0;
    this.dropCount = 0;
    this.fps = 0;

    this.frameCountSinceLastSec = 0;
    this.lastFpsUpdate = performance.now();

    this.elRtt = document.getElementById('diag-rtt');
    this.elFps = document.getElementById('diag-fps');
    this.elPackets = document.getElementById('diag-packets');
    this.elSeq = document.getElementById('diag-seq');
  }

  recordPacketSent(sequence) {
    this.packetCount++;
    this.frameCountSinceLastSec++;

    const now = performance.now();
    if (now - this.lastFpsUpdate >= 1000) {
      this.fps = Math.round((this.frameCountSinceLastSec * 1000) / (now - this.lastFpsUpdate));
      this.frameCountSinceLastSec = 0;
      this.lastFpsUpdate = now;
    }

    if (this.packetCount % 10 === 0) {
      this.updateUI(sequence);
    }
  }

  recordPong(rtt) {
    this.rttMs = Math.round(rtt);
    if (this.elRtt) {
      this.elRtt.textContent = `${this.rttMs} ms`;
    }
  }

  updateUI(sequence) {
    if (this.elFps) this.elFps.textContent = `${this.fps} Hz`;
    if (this.elPackets) this.elPackets.textContent = this.packetCount;
    if (this.elSeq) this.elSeq.textContent = `${sequence} / ${this.dropCount}`;
  }
}
