// Sanity check: SDK installed, WebRTC addon loads, client id present.
import { VERSION, isWrtcAvailable, WRTC_PACKAGE } from 'altspace.js';

console.log(`altspace.js ${VERSION}`);
console.log(isWrtcAvailable() ? 'WebRTC addon: ok' : `WebRTC addon missing: npm install ${WRTC_PACKAGE}`);
console.log(process.env.ALTSPACE_CLIENT_ID ? 'ALTSPACE_CLIENT_ID: set' : 'ALTSPACE_CLIENT_ID: missing (copy .env.example to .env)');
