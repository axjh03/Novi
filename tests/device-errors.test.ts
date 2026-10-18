import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeviceError, deviceError, type CaptureDevice, type Platform } from '../src/renderer/src/services/deviceErrors';
import { captureProvider } from '../src/renderer/src/services/interviewAudio';

const domError = (name: string, message = 'raw browser text') => new DOMException(message, name);

test('capture failures become one plain sentence per device and platform, with the raw text kept as details', () => {
  const blocked = deviceError('microphone', domError('NotAllowedError', 'Permission denied'), 'mac');
  assert(blocked instanceof DeviceError);
  assert.match(blocked.message, /System Settings › Privacy & Security › Microphone, then restart Novi/);
  assert.equal(blocked.details, 'NotAllowedError: Permission denied');
  assert.match(deviceError('microphone', domError('NotAllowedError'), 'windows').message, /Settings › Privacy & security › Microphone/);
  assert.match(deviceError('screen', domError('NotAllowedError'), 'mac').message, /Screen & System Audio Recording, then restart Novi/);
  assert.match(deviceError('system', domError('SecurityError'), 'mac').message, /Screen & System Audio Recording/);
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

test('Windows and Linux refusals give advice that can be followed, since Novi shows no screen picker there', () => {
  // Windows (and Linux with X11) never ask which screen to share: Novi's main process answers the request itself.
  assert.match(deviceError('screen', domError('NotAllowedError'), 'windows').message, /^Screen capture was blocked on this computer, often by security software\. Check that it allows Novi to record the screen, then retry\.$/);
  assert.match(deviceError('system', domError('NotAllowedError'), 'windows').message, /^System audio capture was blocked on this computer, often by security software\./);
  // Wayland's own share dialog may appear on Linux, so it is mentioned only as an "if".
  assert.equal(deviceError('screen', domError('NotAllowedError'), 'linux').message, 'Screen capture was cancelled or blocked. Retry, and if your desktop asks which screen to share, pick one.');
  assert.equal(deviceError('system', domError('SecurityError'), 'linux').message, 'System audio capture was cancelled or blocked. Retry, and if your desktop asks which screen to share, pick one.');
  assert.match(deviceError('microphone', domError('NotFoundError'), 'windows').message, /choose a default microphone in your system’s sound settings/);
});

test('no capture message points to a prompt or a setting that does not exist', () => {
  const devices: CaptureDevice[] = ['microphone', 'system', 'screen'];
  const platforms: Platform[] = ['mac', 'windows', 'linux'];
  const names = ['NotAllowedError', 'SecurityError', 'NotFoundError', 'OverconstrainedError', 'NotReadableError', 'AbortError'];
  for (const device of devices) for (const platform of platforms) for (const name of names) {
    const { message } = deviceError(device, domError(name), platform);
    // Sessions use the default microphone and record system audio with the screen share, never an input picked in Settings.
    assert.doesNotMatch(message, /Audio & Camera/, `${device} ${name} on ${platform}: ${message}`);
    if (platform !== 'mac') assert.doesNotMatch(message, /when asked|when prompted/i, `${device} ${name} on ${platform}: ${message}`);
  }
  for (const platform of ['windows', 'linux'] as const) {
    const help = captureProvider(platform).systemHelp;
    assert.doesNotMatch(help, /select|choose|Audio & Camera/i, `${platform} system audio help: ${help}`);
  }
  assert.match(captureProvider('linux').systemHelp, /PulseAudio or PipeWire/);
  assert.match(captureProvider('mac').systemHelp, /Privacy & Security/);
});
