import React, { useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { desenhar } from './desenho';

// Cada quadro é desenhado do zero num <canvas> (determinístico: o mesmo quadro sempre sai igual).
export const Video = (props) => {
  const frame = useCurrentFrame();
  const ref = useRef(null);
  useLayoutEffect(() => {
    desenhar(ref.current.getContext('2d', { willReadFrequently: true }), frame, props);
  }, [frame, props]);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <canvas ref={ref} width={1280} height={720} />
      <Audio src={staticFile(props.audio)} />
    </AbsoluteFill>
  );
};
