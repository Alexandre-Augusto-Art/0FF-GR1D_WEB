import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { Video } from './Video';
import exemplo from './exemplo.json';

// Props vêm do scripts/gerar.js (--props=...). exemplo.json serve para o Remotion Studio (npm run estudio).
const Root = () => (
  <Composition
    id="W4K3"
    component={Video}
    fps={30}
    width={1280}
    height={720}
    durationInFrames={exemplo.duracao}
    defaultProps={exemplo}
    calculateMetadata={({ props }) => ({ durationInFrames: props.duracao, fps: props.fps })}
  />
);

registerRoot(Root);
