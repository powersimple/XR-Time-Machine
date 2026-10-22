// Records a scenario in real time and never stops: the harness kills this process mid-recording (--crash).
//   node test/crash-child.mjs <scenario> <outDir>
import { createMockRoomClient } from '../mock/mock-room.mjs';
import { buildScene } from '../mock/scenario.mjs';
import { scenarios } from '../mock/scenarios/index.mjs';
import { wallClock } from '../../core/clock.mjs';
import { startRecorder } from '../../core/recorder.mjs';
import { altspaceSource } from '../adapter.mjs';

const [name, outDir] = process.argv.slice(2);
const scene = buildScene(scenarios[name]);
const clock = wallClock();
const { client, durationMs } = createMockRoomClient({ clock, scene, displayName: 'Recorder' });
await client.joinRoom({});
startRecorder({ source: altspaceSource(client), clock, outDir, label: name });
process.send?.('recording');
await clock.runFor(durationMs + 60_000); // far longer than the harness waits before killing us
