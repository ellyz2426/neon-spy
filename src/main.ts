import { World } from '@iwsdk/core';

const container = document.getElementById('scene-container') as HTMLDivElement;

const world = await World.create(container, {
  xr: { offer: 'once' },
  browserControls: true,
} as any);

const { GameSystem } = await import('./game');
world.registerSystem(GameSystem);
