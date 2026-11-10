import { loadNet, saveNet } from './net';

/**
 * Connection Settings: an optional TURN relay for players on strict networks (school, office,
 * some mobile carriers), and an optional self-hosted PeerJS signalling server. Built in code so
 * every page that loads the game gets it.
 */
let box: HTMLDivElement | null = null;

export function netDialogOpen(): boolean {
  return !!box && !box.hidden;
}

export function openNetDialog(onClose: () => void = () => {}): void {
  if (!box) {
    box = document.createElement('div');
    box.style.cssText =
      'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:5;background:#fff;color:#2a1b5e;border-radius:24px;padding:22px 26px;display:flex;flex-direction:column;gap:10px;width:min(460px,90vw);font:600 16px system-ui,sans-serif;box-shadow:0 10px 0 rgba(0,0,0,.25);border:5px solid #9a5bff';
    box.innerHTML = `
      <div style="font-size:22px;font-weight:800">Connection Settings</div>
      <div style="font-weight:500;font-size:14px;line-height:1.4">Online play connects browsers directly. If a friend can't connect (strict school or office Wi-Fi), add a TURN relay here. Everyone in the room should use the same one.</div>
      <label>TURN server URL<input data-k="turnUrl" placeholder="turn:relay.example.com:3478"></label>
      <label>TURN username<input data-k="turnUser" autocomplete="off"></label>
      <label>TURN password<input data-k="turnPass" type="password" autocomplete="off"></label>
      <label>Signalling server (optional)<input data-k="peerServer" placeholder="Leave empty for the free PeerJS server"></label>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button data-act="cancel" style="background:#6b6f86">Cancel</button>
        <button data-act="save" style="background:#21c45a">Save</button>
      </div>`;
    for (const i of box.querySelectorAll('input')) i.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin-top:4px;font:500 15px system-ui;padding:8px 10px;border:2px solid #9a5bff;border-radius:10px';
    for (const b of box.querySelectorAll('button')) b.style.cssText += ';font:700 16px system-ui;border:0;border-radius:12px;padding:10px 18px;color:#fff;cursor:pointer';
    document.body.appendChild(box);
    box.addEventListener('keydown', (e) => e.stopPropagation());
  }
  const b = box;
  const n = loadNet();
  for (const i of b.querySelectorAll<HTMLInputElement>('input')) i.value = String(n[i.dataset.k as keyof typeof n] ?? '');
  const close = () => {
    b.hidden = true;
    b.style.display = 'none';
    onClose();
  };
  (b.querySelector('[data-act=cancel]') as HTMLButtonElement).onclick = close;
  (b.querySelector('[data-act=save]') as HTMLButtonElement).onclick = () => {
    const out = { ...n };
    for (const i of b.querySelectorAll<HTMLInputElement>('input')) (out as Record<string, string>)[i.dataset.k!] = i.value.trim();
    saveNet(out);
    close();
  };
  b.hidden = false;
  b.style.display = 'flex';
  (b.querySelector('input') as HTMLInputElement).focus();
}
