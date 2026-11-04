import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

// Inherited by build workers and the app server. Refuse transport before DNS.
const local = host => ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const options = typeof first === 'object' && first !== null ? first : null;
  const path = options?.path ?? (typeof first === 'string' ? first : undefined);
  const host = options?.host ?? (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (path ? !path.startsWith('/') : !local(host)) throw new Error('s7_external_transport_blocked');
  return connect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = function (input, init) {
  const url = new URL(input instanceof Request ? input.url : input);
  if (!['http:', 'https:'].includes(url.protocol) || !local(url.hostname)) {
    return Promise.reject(new Error('s7_external_transport_blocked'));
  }
  return originalFetch(input, init);
};
syncBuiltinESMExports();
