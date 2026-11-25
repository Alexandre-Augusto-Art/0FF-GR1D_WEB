import React, { useLayoutEffect, useRef, useState } from 'react';
import { AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { desenhar } from './desenho';
import { IMAGENS } from './base';

// Cada quadro é desenhado do zero num <canvas> (determinístico: o mesmo quadro sempre sai igual).
// As ilustrações geradas (props.imagens) são carregadas antes do primeiro quadro.
export const Video = (props) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const ref = useRef(null);
  const [pronto, setPronto] = useState(() => (props.imagens || []).every((f) => IMAGENS[f]));
  const [espera] = useState(() => (pronto ? null : delayRender('ilustrações')));
  useLayoutEffect(() => {
    if (pronto) return;
    Promise.all((props.imagens || []).map((f) => new Promise((ok) => {
      const im = new Image();
      im.onload = () => { IMAGENS[f] = im; ok(); };
      im.onerror = ok;
      im.src = staticFile(f);
    }))).then(() => { setPronto(true); continueRender(espera); });
  }, []);
  useLayoutEffect(() => {
    if (pronto) desenhar(ref.current.getContext('2d', { willReadFrequently: true }), frame, props);
  }, [frame, props, pronto]);
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <canvas ref={ref} width={width} height={height} />
      <Audio src={staticFile(props.audio)} />
    </AbsoluteFill>
  );
};
