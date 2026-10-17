import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeviceError, deviceError } from '../src/renderer/src/services/deviceErrors';

const domError = (name: string, message = 'raw browser text') => new DOMException(message, name);

test('capture failures become one plain sentence per device and platform, with the raw text kept as details', () => {
  const blocked = deviceError('microphone', domError('NotAllowedError', 'Permission denied'), 'mac');
  assert(blocked instanceof DeviceError);
  assert.match(blocked.message, /System Settings › Privacy & Security › Microphone, then restart Novi/);
  assert.equal(blocked.details, 'NotAllowedError: Permission denied');
  assert.match(deviceError('microphone', domError('NotAllowedError'), 'windows').message, /Settings › Privacy & security › Microphone/);
  assert.match(deviceError('screen', domError('NotAllowedError'), 'mac').message, /Screen & System Audio Recording, then restart Novi/);
  assert.match(deviceError('system', domError('SecurityError'), 'mac').message, /Screen & System Audio Recording/);
  assert.match(deviceError('screen', domError('NotAllowedError'), 'linux').message, /choose a screen/);
  assert.match(deviceError('microphone', domError('NotFoundError'), 'linux').message, /No microphone was found/);
  assert.match(deviceError('microphone', domError('OverconstrainedError'), 'mac').message, /No microphone was found/);
  assert.match(deviceError('microphone', domError('NotReadableError'), 'windows').message, /Another app may be using it/);
  assert.match(deviceError('system', domError('AbortError'), 'linux').message, /System audio couldn’t start/);
});

test('unknown failures keep their own text, and converting twice changes nothing', () => {
  const own = deviceError('system', new Error('Choose a system loopback input or enable system audio sharing.'), 'linux');
  assert.equal(own.message, 'Choose a system loopback input or enable system audio sharing.');
  assert.equal(own.details, '', 'no duplicate details when the message is already the raw text');
  const odd = deviceError('microphone', domError('InvalidStateError', 'state broke'), 'mac');
  assert.equal(odd.message, 'state broke');
  const once = deviceError('microphone', domError('NotAllowedError', 'denied'), 'mac');
  assert.equal(deviceError('screen', once, 'linux'), once);
  assert.equal(deviceError('microphone', undefined, 'mac').message, 'Capture is unavailable.');
});
