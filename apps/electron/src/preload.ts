// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

type OpenBrowserWindowResult = { id: number };
type OkResult = { ok: true };
type ViewBounds = { x: number; y: number; width: number; height: number };

contextBridge.exposeInMainWorld('teatimeElectron', {
  openBrowserWindow: (url: string): Promise<OpenBrowserWindowResult> =>
    ipcRenderer.invoke('teatime:open-browser-window', { url }),
  upsertWebContentsView: (args: {
    key: string;
    url: string;
    bounds: ViewBounds;
    visible?: boolean;
  }): Promise<OkResult> => ipcRenderer.invoke('teatime:webcontents-view:upsert', args),
  destroyWebContentsView: (key: string): Promise<OkResult> =>
    ipcRenderer.invoke('teatime:webcontents-view:destroy', { key }),
});
