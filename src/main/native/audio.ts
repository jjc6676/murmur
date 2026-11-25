// Windows Core Audio (COM via koffi): mute the default output and detect playing audio.
// Used for "Mute all audio while dictating" and "Pause music while dictating".
import koffi from 'koffi';

const ole32 = koffi.load('ole32.dll');
// registered by name; referenced as MURMUR_GUID in signatures below
koffi.struct('MURMUR_GUID', { d1: 'uint32_t', d2: 'uint16_t', d3: 'uint16_t', d4: koffi.array('uint8_t', 8) });
const CoInitializeEx = ole32.func('long __stdcall CoInitializeEx(void* reserved, uint32_t coInit)');
const CoCreateInstance = ole32.func('long __stdcall CoCreateInstance(MURMUR_GUID* clsid, void* outer, uint32_t ctx, MURMUR_GUID* iid, _Out_ void** ppv)');

const PRelease = koffi.proto('uint32_t __stdcall MurmurRelease(void* self)');
const PGetDefaultEndpoint = koffi.proto('long __stdcall MurmurGetDefaultEndpoint(void* self, int flow, int role, _Out_ void** device)');
const PActivate = koffi.proto('long __stdcall MurmurActivate(void* self, MURMUR_GUID* iid, uint32_t ctx, void* params, _Out_ void** iface)');
const PSetMute = koffi.proto('long __stdcall MurmurSetMute(void* self, int mute, void* eventCtx)');
const PGetMute = koffi.proto('long __stdcall MurmurGetMute(void* self, _Out_ int* mute)');
const PGetPeak = koffi.proto('long __stdcall MurmurGetPeak(void* self, _Out_ float* peak)');

interface Guid {
  d1: number;
  d2: number;
  d3: number;
  d4: number[];
}

function guid(s: string): Guid {
  const h = s.replace(/-/g, '');
  return {
    d1: parseInt(h.slice(0, 8), 16),
    d2: parseInt(h.slice(8, 12), 16),
    d3: parseInt(h.slice(12, 16), 16),
    d4: Array.from({ length: 8 }, (_, i) => parseInt(h.slice(16 + i * 2, 18 + i * 2), 16)),
  };
}

const CLSID_MMDeviceEnumerator = guid('BCDE0395-E52F-467C-8E3D-C4579291692E');
const IID_IMMDeviceEnumerator = guid('A95664D2-9614-4F35-A746-DE8DB63617E6');
const IID_IAudioEndpointVolume = guid('5CDF2C82-841E-4546-9722-0CF74078229A');
const IID_IAudioMeterInformation = guid('C02216F6-8C67-4B5B-9D00-D008E73E0064');
const CLSCTX_ALL = 23;

type ComPtr = unknown;

function method(obj: ComPtr, index: number): unknown {
  const vtbl = koffi.decode(obj, 'void*');
  return koffi.decode(vtbl, 'void*', index + 1)[index];
}

function release(obj: ComPtr): void {
  if (obj) koffi.call(method(obj, 2), PRelease, obj);
}

/** Activate an interface on the default render (speakers) endpoint; caller must release(). */
function activateOnDefaultOutput(iid: Guid): ComPtr | null {
  CoInitializeEx(null, 2); // STA; harmless if already initialized (S_FALSE / RPC_E_CHANGED_MODE)
  const enumOut: ComPtr[] = [null];
  if (CoCreateInstance(CLSID_MMDeviceEnumerator, null, CLSCTX_ALL, IID_IMMDeviceEnumerator, enumOut) < 0 || !enumOut[0]) return null;
  const enumerator = enumOut[0];
  try {
    const devOut: ComPtr[] = [null];
    if (koffi.call(method(enumerator, 4), PGetDefaultEndpoint, enumerator, 0 /* eRender */, 1 /* eMultimedia */, devOut) < 0 || !devOut[0]) return null;
    const device = devOut[0];
    try {
      const ifaceOut: ComPtr[] = [null];
      if (koffi.call(method(device, 3), PActivate, device, iid, CLSCTX_ALL, null, ifaceOut) < 0) return null;
      return ifaceOut[0] ?? null;
    } finally {
      release(device);
    }
  } finally {
    release(enumerator);
  }
}

export function getOutputMuted(): boolean | null {
  const vol = activateOnDefaultOutput(IID_IAudioEndpointVolume);
  if (!vol) return null;
  try {
    const out = [0];
    return koffi.call(method(vol, 15), PGetMute, vol, out) < 0 ? null : out[0] !== 0;
  } finally {
    release(vol);
  }
}

export function setOutputMuted(muted: boolean): boolean {
  const vol = activateOnDefaultOutput(IID_IAudioEndpointVolume);
  if (!vol) return false;
  try {
    return koffi.call(method(vol, 14), PSetMute, vol, muted ? 1 : 0, null) >= 0;
  } finally {
    release(vol);
  }
}

/** Current peak level (0..1) of the default output — > 0 means something is audibly playing. */
export function outputPeak(): number {
  const meter = activateOnDefaultOutput(IID_IAudioMeterInformation);
  if (!meter) return 0;
  try {
    const out = [0];
    return koffi.call(method(meter, 3), PGetPeak, meter, out) < 0 ? 0 : out[0];
  } finally {
    release(meter);
  }
}
