import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Video } from './Video';
import exemplo from './exemplo.json';

// Props vêm do scripts/gerar.js (--props=...). exemplo.json serve para o Remotion Studio (npm run estudio).
// W4K3 = horizontal 16:9 (YouTube); W4K3V = vertical 9:16 (Reels, Shorts, TikTok). Mesmo roteiro e mesma voz.
const meta = ({ props }) => ({ durationInFrames: props.duracao, fps: props.fps });
const Root = () => (
  <>
    <Composition id="W4K3" component={Video} fps={30} width={1280} height={720}
      durationInFrames={exemplo.duracao} defaultProps={exemplo} calculateMetadata={meta} />
    <Composition id="W4K3V" component={Video} fps={30} width={1080} height={1920}
      durationInFrames={exemplo.duracao} defaultProps={exemplo} calculateMetadata={meta} />
  </>
);

registerRoot(Root);
