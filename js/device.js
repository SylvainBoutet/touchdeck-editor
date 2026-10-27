// Talks to the TouchDeck over USB with Web Serial (Chrome, Edge).
// Protocol: see src/app/Console.h in the firmware. Replies start with "@",
// every other line is a log line.

const ESPRESSIF_VID = 0x303a;
// Bytes per "W" line: firmware 0.3.0 and later read 3000, earlier ones 768
const CHUNK_SMALL = 768;
const CHUNK_LARGE = 3000;

export function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map(Number);
  const pb = String(b || '0').split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

export class DeviceError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

export class Device {
  constructor() {
    this.port = null;
    this.reader = null;
    this.buffer = new Uint8Array(0);
    this.waiters = [];
    this.lines = [];
    this.binaryWanted = 0;
    this.binaryResolve = null;
    this.queue = Promise.resolve();
    this.onLog = () => {};
    this.onDisconnect = () => {};
  }

  static supported() {
    return 'serial' in navigator;
  }

  get connected() {
    return this.port !== null;
  }

  // Reuses the card already allowed on this computer, otherwise asks to pick it
  async connect() {
    const known = (await navigator.serial.getPorts()).filter((p) => p.getInfo().usbVendorId === ESPRESSIF_VID);
    for (const port of known) {
      try {
        return await this.open(port);
      } catch (e) {
        /* not plugged in, or busy */
      }
    }
    return this.open(await navigator.serial.requestPort({ filters: [{ usbVendorId: ESPRESSIF_VID }] }));
  }

  async open(port) {
    await port.open({ baudRate: 115200, bufferSize: 65536 });
    await port.setSignals({ dataTerminalReady: true, requestToSend: false });
    return this.attach(port);
  }

  async attach(port) {
    this.port = port;
    this.buffer = new Uint8Array(0);
    this.readLoop();
    navigator.serial.addEventListener('disconnect', (e) => {
      if (e.target === this.port) this.closed();
    });
    // Leftovers of a previous session
    await new Promise((r) => setTimeout(r, 300));
    this.lines = [];
    this.helloInfo = await this.hello();
    return this.helloInfo;
  }

  // After a restart of the card: reopens the port already allowed by the user
  async reconnect(timeoutMs = 30000) {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      await new Promise((r) => setTimeout(r, 1000));
      const ports = (await navigator.serial.getPorts()).filter((p) => p.getInfo().usbVendorId === ESPRESSIF_VID);
      for (const port of ports) {
        try {
          await port.open({ baudRate: 115200, bufferSize: 65536 });
          await port.setSignals({ dataTerminalReady: true, requestToSend: false });
          return await this.attach(port);
        } catch (e) {
          try {
            await port.close();
          } catch (_) {
            /* not open */
          }
        }
      }
    }
    throw new DeviceError('timeout', "La carte n'est pas revenue après son redémarrage.");
  }

  get chunk() {
    return compareVersions(this.helloInfo?.version, '0.3.0') >= 0 ? CHUNK_LARGE : CHUNK_SMALL;
  }

  async disconnect() {
    if (!this.port) return;
    try {
      await this.reader?.cancel();
      await this.port.close();
    } catch (e) {
      /* already gone */
    }
    this.closed();
  }

  closed() {
    if (!this.port) return;
    this.port = null;
    for (const w of this.waiters) w.reject(new DeviceError('disconnected', 'Carte déconnectée'));
    this.waiters = [];
    this.onDisconnect();
  }

  async readLoop() {
    const decoder = new TextDecoder();
    const port = this.port;
    try {
      while (this.port === port && port?.readable) {
        this.reader = port.readable.getReader();
        try {
          for (;;) {
            const { value, done } = await this.reader.read();
            if (done) break;
            this.feed(value, decoder);
          }
        } finally {
          this.reader.releaseLock();
        }
      }
    } catch (e) {
      /* port lost */
    }
    // A reconnection may already have attached a new port
    if (this.port === port) this.closed();
  }

  feed(bytes, decoder) {
    const merged = new Uint8Array(this.buffer.length + bytes.length);
    merged.set(this.buffer);
    merged.set(bytes, this.buffer.length);
    this.buffer = merged;

    for (;;) {
      if (this.binaryWanted > 0) {
        if (this.buffer.length < this.binaryWanted) return;
        const data = this.buffer.slice(0, this.binaryWanted);
        this.buffer = this.buffer.slice(this.binaryWanted);
        this.binaryWanted = 0;
        this.binaryResolve(data);
        continue;
      }
      const nl = this.buffer.indexOf(10);
      if (nl < 0) return;
      const line = decoder.decode(this.buffer.slice(0, nl)).replace(/\r$/, '');
      this.buffer = this.buffer.slice(nl + 1);
      this.handleLine(line);
    }
  }

  handleLine(line) {
    if (line.startsWith('SCREENSHOT ') && this.screenshotWaiter) {
      const [, w, h, rot] = line.split(' ').map(Number);
      const waiter = this.screenshotWaiter;
      this.screenshotWaiter = null;
      this.binaryWanted = w * h * 2;
      this.binaryResolve = (data) => waiter({ w, h, rot, data });
      return;
    }
    if (!line.startsWith('@')) {
      if (line.trim() && line !== 'END') this.onLog(line);
      return;
    }
    const waiter = this.waiters[0];
    if (waiter && waiter.accept(line)) {
      this.waiters.shift();
    } else if (!waiter) {
      this.onLog(line);
    }
  }

  async send(text) {
    if (!this.port) throw new DeviceError('disconnected', 'Carte non connectée');
    const writer = this.port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(text + '\n'));
    } finally {
      writer.releaseLock();
    }
  }

  // Sends a command and resolves with its final reply. `collect` receives the
  // intermediate "@" lines (READ data) and returns true when the line is final.
  request(text, collect = null, timeout = 8000) {
    const run = () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.waiters = this.waiters.filter((w) => w !== waiter);
          reject(new DeviceError('timeout', `Pas de réponse de la carte (${text.split(' ')[0]})`));
        }, timeout);
        const waiter = {
          accept: (line) => {
            if (collect && !collect(line)) return false;
            clearTimeout(timer);
            if (line.startsWith('@ERR')) reject(new DeviceError(line.slice(5).trim()));
            else resolve(line);
            return true;
          },
          reject: (e) => {
            clearTimeout(timer);
            reject(e);
          },
        };
        this.waiters.push(waiter);
        this.send(text).catch(reject);
      });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  json(line, prefix) {
    return JSON.parse(line.slice(prefix.length + 1));
  }

  async hello() {
    return this.json(await this.request('HELLO'), '@HELLO');
  }

  async info() {
    return this.json(await this.request('INFO'), '@INFO');
  }

  async auth(code) {
    await this.request(`AUTH ${code}`, null, 5000);
  }

  async setPin(code) {
    await this.request(`PIN ${code}`);
  }

  async list() {
    return this.json(await this.request('LS'), '@LS');
  }

  async readFile(path) {
    const parts = [];
    await this.request(
      `READ ${path}`,
      (line) => {
        if (line.startsWith('@R ')) {
          parts.push(Uint8Array.from(atob(line.slice(3)), (c) => c.charCodeAt(0)));
          return false;
        }
        return true;
      },
      30000
    );
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  async readText(path) {
    return new TextDecoder().decode(await this.readFile(path));
  }

  async writeFile(path, bytes, onProgress = () => {}) {
    await this.request(`WRITE ${path} ${bytes.length}`);
    if (bytes.length === 0) return;
    await this.sendChunks(bytes, onProgress);
  }

  async sendChunks(bytes, onProgress, timeout = 8000) {
    const size = this.chunk;
    for (let i = 0; i < bytes.length; i += size) {
      const chunk = bytes.subarray(i, i + size);
      let bin = '';
      for (const b of chunk) bin += String.fromCharCode(b);
      await this.request(`W ${btoa(bin)}`, null, timeout);
      onProgress(Math.min(i + size, bytes.length), bytes.length);
    }
  }

  // Firmware update: the card checks the MD5, switches to the new firmware and restarts
  async updateFirmware(bytes, md5, onProgress = () => {}) {
    await this.request(`OTA ${bytes.length} ${md5}`, null, 15000);
    await this.sendChunks(bytes, onProgress, 20000);
  }

  async writeText(path, text, onProgress) {
    await this.writeFile(path, new TextEncoder().encode(text), onProgress);
  }

  async remove(path) {
    await this.request(`RM ${path}`);
  }

  async reload() {
    await this.request('RELOAD');
  }

  async setWifi(ssid, password) {
    await this.request(`WIFI ${JSON.stringify({ ssid, password })}`);
  }

  // Live data for testing ("SET cpu 42") and page changes; no reply expected
  async set(key, value) {
    await this.send(`SET ${key} ${value}`);
  }

  async showPage(id) {
    await this.send(`PAGE ${id}`);
  }

  // Raw screen: native portrait RGB565 little endian, rotated by the caller
  screenshot() {
    const run = () =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.screenshotWaiter = null;
          reject(new DeviceError('timeout', 'Pas de capture reçue'));
        }, 8000);
        this.screenshotWaiter = (shot) => {
          clearTimeout(timer);
          resolve(shot);
        };
        this.send('SCREENSHOT').catch(reject);
      });
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }
}
