(() => {
  "use strict";

  const BROKER = "wss://broker.hivemq.com:8884/mqtt";
  let socket = null;
  let closed = true;
  let topics = [];
  let handlers = {};
  let pingTimer = 0;
  let retryTimer = 0;
  let clientId = "";
  let opening = null;

  function utf(value) {
    const bytes = new TextEncoder().encode(value);
    return [(bytes.length >> 8) & 255, bytes.length & 255, ...bytes];
  }

  function packet(type, body) {
    const length = [];
    let n = body.length;
    do {
      let digit = n % 128;
      n = Math.floor(n / 128);
      if (n > 0) digit |= 128;
      length.push(digit);
    } while (n > 0);
    return Uint8Array.from([type, ...length, ...body]);
  }

  function connectPacket(id) {
    return packet(0x10, [...utf("MQTT"), 4, 2, 0, 30, ...utf(id)]);
  }

  function subscribePacket(topicList) {
    const body = [0, 1];
    topicList.forEach((topic) => body.push(...utf(topic), 0));
    return packet(0x82, body);
  }

  function publishPacket(topic, text, retain) {
    return packet(retain ? 0x31 : 0x30, [...utf(topic), ...new TextEncoder().encode(text)]);
  }

  function readRemaining(bytes) {
    let value = 0;
    let multiplier = 1;
    let index = 1;
    let digit = 0;
    do {
      if (index >= bytes.length) return null;
      digit = bytes[index++];
      value += (digit & 127) * multiplier;
      multiplier *= 128;
    } while (digit & 128);
    return { value, index };
  }

  function parsePublish(bytes) {
    const head = readRemaining(bytes);
    if (!head) return null;
    let index = head.index;
    const topicLength = (bytes[index] << 8) | bytes[index + 1];
    index += 2;
    const topic = new TextDecoder().decode(bytes.slice(index, index + topicLength));
    index += topicLength;
    const payload = new TextDecoder().decode(bytes.slice(index, head.index + head.value));
    return { topic, payload };
  }

  function send(bytes) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(bytes);
  }

  function resubscribe() {
    if (topics.length) send(subscribePacket(topics));
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    if (closed) return;
    retryTimer = setTimeout(() => {
      openSocket().catch(() => scheduleRetry());
    }, 2000);
  }

  function openSocket() {
    if (opening) return opening;
    opening = new Promise((resolve, reject) => {
      const ws = new WebSocket(BROKER, ["mqtt"]);
      socket = ws;
      ws.binaryType = "arraybuffer";
      const fail = setTimeout(() => {
        reject(new Error("timeout"));
        try { ws.close(); } catch (_) {}
      }, 8000);
      ws.onopen = () => send(connectPacket(clientId));
      ws.onmessage = (event) => {
        const bytes = new Uint8Array(event.data);
        const type = bytes[0] >> 4;
        if (type === 2) {
          clearTimeout(fail);
          const code = bytes[bytes.length - 1];
          if (code !== 0) {
            reject(new Error("mqtt"));
            return;
          }
          resubscribe();
          clearInterval(pingTimer);
          pingTimer = setInterval(() => send(Uint8Array.from([0xc0, 0x00])), 20000);
          if (handlers.onUp) handlers.onUp();
          resolve();
          return;
        }
        if (type === 3) {
          const message = parsePublish(bytes);
          if (!message || !handlers.onJson) return;
          try {
            handlers.onJson(message.topic, JSON.parse(message.payload));
          } catch (_) {}
        }
      };
      ws.onclose = () => {
        clearTimeout(fail);
        clearInterval(pingTimer);
        opening = null;
        if (handlers.onDown) handlers.onDown();
        scheduleRetry();
      };
      ws.onerror = () => {};
    }).finally(() => {
      opening = null;
    });
    return opening;
  }

  function start(nextHandlers) {
    handlers = nextHandlers || {};
    closed = false;
    clientId = `px${Math.random().toString(36).slice(2, 10)}`;
    if (socket) {
      const old = socket;
      socket = null;
      old.onclose = null;
      old.onmessage = null;
      try { old.close(); } catch (_) {}
    }
    return openSocket();
  }

  function subscribe(topic) {
    if (!topics.includes(topic)) topics.push(topic);
    if (socket && socket.readyState === WebSocket.OPEN) resubscribe();
  }

  function publish(topic, data, retain) {
    send(publishPacket(topic, JSON.stringify(data), !!retain));
  }

  function stop() {
    closed = true;
    topics = [];
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    if (socket) {
      try { socket.close(); } catch (_) {}
    }
    socket = null;
  }

  window.XoNet = { start, subscribe, publish, stop };
})();
