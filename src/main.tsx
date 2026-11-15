import { render } from 'preact';
import { parseSave, SAVE_KEY, serializeSave } from './meta/save';
import { createPlatform } from './platform';
import { App } from './ui/App';
import './ui/styles.css';

async function start(): Promise<void> {
  const platform = await createPlatform();
  await platform.init();

  const save = parseSave(await platform.storageGet(SAVE_KEY));
  save.launches++;
  await platform.storageSet(SAVE_KEY, serializeSave(save));

  const root = document.getElementById('app');
  if (!root) throw new Error('Missing #app');
  render(<App platform={platform} launches={save.launches} />, root);
  platform.loadingFinished();
}

void start();
