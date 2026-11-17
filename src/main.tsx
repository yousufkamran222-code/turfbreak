import { render } from 'preact';
import { Synth } from './audio/synth';
import { parseSave, SAVE_KEY } from './meta/save';
import { createPlatform } from './platform';
import { App } from './ui/App';
import { Game } from './ui/game';
import './ui/styles.css';

async function start(): Promise<void> {
  const platform = await createPlatform();
  await platform.init();

  // A corrupt or unreadable save parses to defaults; it never throws.
  const save = parseSave(await platform.storageGet(SAVE_KEY));
  save.launches++;
  // The queued write below retries failures without blocking startup.

  const game = new Game(platform, new Synth(), save);
  game.commit(save);
  await game.loadPrefs();

  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app');
  render(<App game={game} />, root);
  platform.loadingFinished();
}

void start();
