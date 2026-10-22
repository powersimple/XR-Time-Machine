// Timeline files for editors, from a studio export: FCP7 XML (xmeml v4, which Premiere imports natively)
// and OpenTimelineIO JSON (Premiere 26+, Resolve and others).
//
// Sequence layout:
//   V1        the program: the auto-director's cut, built from the iso camera clips (cuts and cross dissolves),
//             so every decision can be re-cut, trimmed or swapped to another angle in the editor
//   V2…       every iso camera, full length and disabled, ready to drag up or to make a multicam source
//   A1, A2    program mix (mic'd), stereo        A3, A4  program mix (spatial), stereo, muted
//   A5…       one dry voice stem per participant
//   markers   every speech turn ("Ava speaking"), joins and leaves
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rateXml = (fps) => `<rate><timebase>${fps}</timebase><ntsc>FALSE</ntsc></rate>`;
const url = (path) => pathToFileURL(path).href.replace('file:///', 'file://localhost/');

// media: { cameras: [{ id, label, path }], program: { path }, mixes: { micd, spatial }, stems: [{ id, name, path }] }
export function xmeml({ name, fps, frames, width, height, shots, cameras, media, markers }) {
  let clipN = 0;
  const fileOnce = new Set();
  const videoFile = (id, path, label) => {
    if (fileOnce.has(id)) return `<file id="${id}"/>`;
    fileOnce.add(id);
    return `<file id="${id}"><name>${esc(label)}</name><pathurl>${esc(url(path))}</pathurl>${rateXml(fps)}<duration>${frames}</duration>` +
      `<media><video><samplecharacteristics>${rateXml(fps)}<width>${width}</width><height>${height}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></video></media></file>`;
  };
  const audioFile = (id, path, label, channels) => {
    if (fileOnce.has(id)) return `<file id="${id}"/>`;
    fileOnce.add(id);
    return `<file id="${id}"><name>${esc(label)}</name><pathurl>${esc(url(path))}</pathurl>${rateXml(fps)}<duration>${frames}</duration>` +
      `<media><audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>${channels}</channelcount></audio></media></file>`;
  };
  const clip = (label, start, end, inF, file, extra = '') =>
    `<clipitem id="clipitem-${++clipN}"><name>${esc(label)}</name><enabled>TRUE</enabled><duration>${frames}</duration>${rateXml(fps)}` +
    `<start>${start}</start><end>${end}</end><in>${inF}</in><out>${inF + (end - start)}</out>${file}${extra}</clipitem>`;

  const camById = new Map(cameras.map((c) => [c.id, c]));
  const camPath = new Map(media.cameras.map((c) => [c.id, c.path]));
  // V1: the program cut.
  const v1 = [];
  shots.forEach((s, i) => {
    if (s.transition?.type === 'dissolve' && i > 0) {
      const half = Math.floor(s.transition.frames / 2);
      v1.push(`<transitionitem><start>${s.start - half}</start><end>${s.start + half}</end><alignment>center</alignment>${rateXml(fps)}` +
        `<effect><name>Cross Dissolve</name><effectid>Cross Dissolve</effectid><effectcategory>Dissolve</effectcategory><effecttype>transition</effecttype><mediatype>video</mediatype></effect></transitionitem>`);
    }
    const cam = camById.get(s.camera);
    v1.push(clip(cam.label, s.start, s.end, s.start, videoFile(`file-cam-${cam.id}`, camPath.get(cam.id), basename(camPath.get(cam.id)))));
  });
  const isoTracks = media.cameras.map((c) => `<track><enabled>FALSE</enabled>${clip(camById.get(c.id)?.label ?? c.id, 0, frames, 0, videoFile(`file-cam-${c.id}`, c.path, basename(c.path)))}</track>`);
  const stereoTracks = (id, path, label, muted) => [1, 2].map((ch) => `<track>${muted ? '<enabled>FALSE</enabled>' : ''}${clip(label, 0, frames, 0, audioFile(id, path, basename(path), 2),
    `<sourcetrack><mediatype>audio</mediatype><trackindex>${ch}</trackindex></sourcetrack>`)}</track>`).join('');
  const stemTracks = media.stems.map((s) => `<track>${clip(`${s.name} voice`, 0, frames, 0, audioFile(`file-voice-${s.id}`, s.path, basename(s.path), 1),
    '<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>')}</track>`);
  const markerXml = markers.map((m) => `<marker><name>${esc(m.name)}</name><comment>${esc(m.comment ?? '')}</comment><in>${m.frame}</in><out>${m.endFrame ?? -1}</out></marker>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
<sequence id="sequence-1">
<name>${esc(name)}</name>
<duration>${frames}</duration>
${rateXml(fps)}
<timecode>${rateXml(fps)}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>
<media>
<video>
<format><samplecharacteristics>${rateXml(fps)}<width>${width}</width><height>${height}</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>
<track>${v1.join('')}</track>
${isoTracks.join('\n')}
</video>
<audio>
<numOutputChannels>2</numOutputChannels>
<format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>
${stereoTracks('file-mix-micd', media.mixes.micd, 'Program mix (mic\'d)', false)}
${stereoTracks('file-mix-spatial', media.mixes.spatial, 'Program mix (spatial)', true)}
${stemTracks.join('\n')}
</audio>
</media>
${markerXml.join('\n')}
</sequence>
</xmeml>
`;
}

// OpenTimelineIO (OTIO JSON schema) with the same layout.
export function otio({ name, fps, frames, shots, cameras, media, markers }) {
  const rt = (v) => ({ OTIO_SCHEMA: 'RationalTime.1', rate: fps, value: v });
  const range = (start, dur) => ({ OTIO_SCHEMA: 'TimeRange.1', start_time: rt(start), duration: rt(dur) });
  const ref = (path) => ({ OTIO_SCHEMA: 'ExternalReference.1', target_url: pathToFileURL(path).href, available_range: range(0, frames), metadata: {} });
  const clip = (label, path, start, dur) => ({ OTIO_SCHEMA: 'Clip.2', name: label, source_range: range(start, dur), media_references: { DEFAULT_MEDIA: ref(path) }, active_media_reference_key: 'DEFAULT_MEDIA', effects: [], markers: [], enabled: true, metadata: {} });
  const track = (label, kind, children, enabled = true) => ({ OTIO_SCHEMA: 'Track.1', name: label, kind, children, effects: [], markers: [], enabled, source_range: null, metadata: {} });
  const camById = new Map(cameras.map((c) => [c.id, c]));
  const camPath = new Map(media.cameras.map((c) => [c.id, c.path]));
  const program = [];
  shots.forEach((s, i) => {
    if (s.transition?.type === 'dissolve' && i > 0) {
      const half = Math.floor(s.transition.frames / 2);
      program.push({ OTIO_SCHEMA: 'Transition.1', name: 'Cross Dissolve', transition_type: 'SMPTE_Dissolve', in_offset: rt(half), out_offset: rt(half), metadata: {} });
    }
    program.push(clip(camById.get(s.camera).label, camPath.get(s.camera), s.start, s.end - s.start));
  });
  const tracks = [
    track('Program', 'Video', program),
    ...media.cameras.map((c) => track(camById.get(c.id)?.label ?? c.id, 'Video', [clip(camById.get(c.id)?.label ?? c.id, c.path, 0, frames)], false)),
    track("Program mix (mic'd)", 'Audio', [clip("Program mix (mic'd)", media.mixes.micd, 0, frames)]),
    track('Program mix (spatial)', 'Audio', [clip('Program mix (spatial)', media.mixes.spatial, 0, frames)], false),
    ...media.stems.map((s) => track(`${s.name} voice`, 'Audio', [clip(`${s.name} voice`, s.path, 0, frames)])),
  ];
  return JSON.stringify({
    OTIO_SCHEMA: 'Timeline.1', name, global_start_time: rt(0), metadata: { xr_time_machine: { cameras } },
    tracks: { OTIO_SCHEMA: 'Stack.1', name: 'tracks', children: tracks, effects: [], enabled: true, source_range: null, metadata: {},
      markers: markers.map((m) => ({ OTIO_SCHEMA: 'Marker.2', name: m.name, comment: m.comment ?? '', color: m.color ?? 'BLUE', marked_range: range(m.frame, Math.max(0, (m.endFrame ?? m.frame) - m.frame)), metadata: {} })) },
  }, null, 2);
}
